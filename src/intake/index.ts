// Chat agent (owner: Pranav). AGENTS.md section 6, "Chat agent". The only agent a person talks to:
// intake, soft preferences, relaxation replies (after a relaxation ask or a NO), questions about the
// agreement. One LLM context per person, built from their own rows (store.ts) and their own thread.
// The router calls these two functions.

import { onIntakeDone, runNegotiation } from '../conversation/negotiation.ts';
import { chatEffort, llm, type ChatResult } from '../llm/index.ts';
import { sendAgentReply, sendTo } from '../privacy/sendTo.ts';
import type { Membership } from '../router/cases.ts';
import { buildSystemPrompt } from './prompt.ts';
import { latestAgreementText, loadState, recentTurns, setFlags } from './store.ts';
import { runTools, toolsFor } from './tools.ts';

const SORRY_TROUBLE = "Sorry, I'm having trouble on my end. Give me a minute and try again.";
const SORRY_REFUSED = "Sorry, I can't help with that one. Could you put it another way?";
const SAFE_AFTER_BLOCK = 'Sorry, let me put that differently. Could you say that again, or tell me what you\'d like to do next?';
const NEGOTIATING ="I'm working on a deal right now. I'll text you as soon as there's something to look at.";

/**
 * Models occasionally write a tool call into their visible text (`<invoke name="reply"><parameter ...>hi</parameter>`)
 * instead of calling the tool. Never send markup to a person: pull the message out of it, or return null so
 * the caller writes the reply with a follow-up call.
 */
export function cleanReply(text: string | null): string | null {
  if (!text) return null;
  // Anything that looks like a tag (<invoke>, <parameter>, <reasoning>, ...) means markup leaked.
  if (!/<\/?[a-z_][\w:-]*[\s>"]/i.test(text)) return text.trim() || null;
  // A tool call written as text: the message is inside <parameter>.
  const inner = [...text.matchAll(/<parameter[^>]*>([\s\S]*?)<\/parameter>/gi)].map((m) => m[1]!.trim()).filter(Boolean);
  const candidate = inner.length
    ? inner.join(' ')
    : text
        // Notes-to-self blocks go entirely, contents included.
        .replace(/<(reasoning|thinking|analysis|scratchpad|note)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        // Anything after an unclosed tag is a note to self, not part of the message.
        .replace(/<[a-z_][^>]*>?[\s\S]*$/i, ' ');
  const cleaned = candidate.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/** Called once per person when the case moves to intake (B joined). Fixed text: fast, no LLM. */
export async function startIntake(me: Membership): Promise<void> {
  const s = await loadState(me);
  const ex = s.other?.display_name ?? 'your ex';
  await sendTo(
    me.id,
    `You're in. Everything you tell me stays private: ${ex} never sees your answers or your numbers. ` +
      "First, let's list what you two share and need to split: furniture, electronics, the apartment lease, pets, " +
      "subscriptions like Netflix or the internet. What's on your list?",
  );
}

/** Every message that isn't a keyword for the current state. */
export async function handleAgentMessage(me: Membership, _text: string): Promise<void> {
  if (me.status === 'negotiating') {
    await sendTo(me.id, NEGOTIATING);
    return;
  }

  const s = await loadState(me);
  const today = new Date().toISOString().slice(0, 10);
  const agreement = me.status === 'awaiting_confirmation' ? await latestAgreementText(me.case_id) : null;
  const turns = await recentTurns(me.id); // includes the message that just came in (the router saved it)

  let result: ChatResult;
  try {
    result = await llm().chat({
      system: buildSystemPrompt(s, today, agreement),
      turns,
      tools: toolsFor(me.status),
      effort: chatEffort(),
    });
  } catch (err) {
    console.error(`[chat agent] LLM call failed for ${me.id}:`, err instanceof Error ? err.message : err);
    await sendTo(me.id, SORRY_TROUBLE);
    return;
  }
  if (result.refused) {
    await sendTo(me.id, SORRY_REFUSED);
    return;
  }

  const outcome = await runTools(result.toolCalls, s);
  let reply = cleanReply(outcome.reply) ?? cleanReply(result.text);

  // A tool failed (its reply may claim success) or there was no reply: one more short call, no tools,
  // told exactly what happened, to write the message.
  const failed = outcome.results.filter((r) => !r.ok);
  if (!reply || failed.length) {
    const happened = outcome.results.map((r) => `${r.tool}: ${r.ok ? 'done' : 'FAILED'} (${r.note})`).join('\n') || 'nothing';
    try {
      const follow = await llm().chat({
        system:
          `${buildSystemPrompt(s, today, agreement, false)}\n\nWhat your tools just did:\n${happened}\n` +
          'Now write your text message to them in plain text (no tools). If something failed, ask a short question to fix it.',
        turns,
        effort: chatEffort(),
      });
      reply = (!follow.refused && cleanReply(follow.text)) || reply;
    } catch (err) {
      console.error(`[chat agent] follow-up call failed for ${me.id}:`, err instanceof Error ? err.message : err);
    }
  }
  if (!reply) {
    await sendTo(me.id, SORRY_TROUBLE);
  } else if (!(await sendAgentReply(me.id, reply))) {
    // The leak filter blocked the draft (and logged it). Rewrite once without specifics; if that's
    // blocked too, send a safe line. The blocked draft is never sent or stored.
    let sent = false;
    try {
      const name = s.me.display_name ?? 'them';
      const ex = s.other?.display_name ?? 'their ex';
      const retry = await llm().chat({
        system:
          `${buildSystemPrompt(s, today, agreement, false)}\n\nYour last draft can't be sent. Rewrite your reply without any ` +
          `dollar amount or date unless ${name} said it to you themselves, and without anything about what ${ex} values, wants, or would accept.`,
        turns,
        effort: chatEffort(),
      });
      const text = retry.refused ? null : cleanReply(retry.text);
      if (text) sent = await sendAgentReply(me.id, text);
    } catch (err) {
      console.error(`[chat agent] rewrite after a block failed for ${me.id}:`, err instanceof Error ? err.message : err);
    }
    if (!sent) await sendTo(me.id, SAFE_AFTER_BLOCK);
  }

  // Act only after replying, so their "all set" lands before any negotiation messages.
  try {
    if (outcome.finished) await onIntakeDone(me.case_id);
    if (outcome.tryAgain) {
      await setFlags(me.id, { changed_since_ask: false });
      await runNegotiation(me.case_id);
    }
  } catch (err) {
    console.error(`[chat agent] negotiation failed for case ${me.case_id}:`, err instanceof Error ? err.message : err);
  }
}
