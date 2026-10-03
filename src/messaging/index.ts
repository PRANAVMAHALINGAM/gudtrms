// Photon Spectrum adapter (owner: Pranav). The only file that talks to spectrum-ts.
// Everything else deals in handles:
//   - iMessage: the sender's address (E.164 phone number, or an Apple ID email)
//   - terminal: the phone number we texted first (see below), else `terminal:<chat id>`
//
// Pick the provider with MESSAGING_PROVIDER=terminal|imessage in .env (default terminal).
//
// Terminal dev trick: tuichat supports several chats. Texting a new handle opens a new
// chat window bound to that handle, so you can play both people. Start as A in chat-1,
// give a fake number for B, and B's invite shows up in a new chat you can reply from.

import { Spectrum, type Message, type Space } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { terminal } from 'spectrum-ts/providers/terminal';

export type MessagingProvider = 'terminal' | 'imessage';
export type InboundHandler = (handle: string, text: string) => Promise<void>;

interface Connection {
  provider: MessagingProvider;
  messages: AsyncIterable<[Space, Message]>;
  /** Open (or reuse) a 1:1 DM with a handle, including one we've never texted. */
  openDm(handle: string): Promise<Space>;
  stop(): Promise<void>;
}

const TERMINAL_PREFIX = 'terminal:';

let conn: Connection | undefined;
const spaceByHandle = new Map<string, Space>();
/** Terminal only: chat id -> the handle we opened that chat for. */
const handleByTerminalChat = new Map<string, string>();
/** One promise chain per handle, so one person's messages are handled in order without blocking the other. */
const queues = new Map<string, Promise<void>>();

/** Simulations and tests: when set, sendToHandle calls this instead of sending anything. */
let capture: ((handle: string, text: string) => void | Promise<void>) | undefined;

export function captureOutbound(fn: typeof capture): void {
  capture = fn;
}

export function messagingProvider(): MessagingProvider {
  return process.env.MESSAGING_PROVIDER === 'imessage' ? 'imessage' : 'terminal';
}

async function connect(provider: MessagingProvider): Promise<Connection> {
  if (provider === 'imessage') {
    const projectId = process.env.SPECTRUM_PROJECT_ID;
    const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
    if (!projectId || !projectSecret) {
      throw new Error('MESSAGING_PROVIDER=imessage needs SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET in .env.');
    }
    const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
    const im = imessage(app);
    return {
      provider,
      messages: app.messages,
      openDm: (handle) => im.space.create(handle),
      stop: () => app.stop(),
    };
  }

  const app = await Spectrum({ providers: [terminal.config()] });
  const term = terminal(app);
  return {
    provider,
    messages: app.messages,
    openDm: (handle) =>
      handle.startsWith(TERMINAL_PREFIX)
        ? term.space.get(handle.slice(TERMINAL_PREFIX.length))
        : term.space.create(handle),
    stop: () => app.stop(),
  };
}

function handleFor(c: Connection, space: Space, message: Message): string {
  if (c.provider === 'terminal') {
    return handleByTerminalChat.get(space.id) ?? `${TERMINAL_PREFIX}${space.id}`;
  }
  return message.sender?.id ?? '';
}

/**
 * Connects to Photon and calls `onMessage` for every inbound text message.
 * Resolves only when the message stream ends.
 */
export async function startMessaging(onMessage: InboundHandler): Promise<void> {
  if (conn) throw new Error('startMessaging was already called.');
  const c = await connect(messagingProvider());
  conn = c;
  // MESSAGING_DEBUG=1 logs connection and event metadata (never message text).
  const debug = process.env.MESSAGING_DEBUG === '1';
  if (debug) console.log(`[messaging] connected via ${c.provider}, waiting for messages`);

  for await (const [space, message] of c.messages) {
    if (debug) {
      console.log(
        `[messaging] event direction=${message.direction} type=${message.content.type} sender=${message.sender?.id ?? '(none)'} space=${space.id}`,
      );
    }
    if (message.direction !== 'inbound' || message.content.type !== 'text') continue;
    const handle = handleFor(c, space, message);
    if (!handle) continue;
    spaceByHandle.set(handle, space);

    const text = message.content.text.trim();
    // Never log message text: it may contain private values (privacy rule 6).
    const next = (queues.get(handle) ?? Promise.resolve())
      .then(() => onMessage(handle, text))
      .catch((err) => console.error(`[messaging] handler failed for ${handle}:`, err));
    queues.set(handle, next);
  }
}

/**
 * Sends raw text to a handle, opening a DM first if we've never texted them.
 * Does NOT run the leak filter: everything except the fixed invite should go
 * through `sendTo` in src/privacy instead.
 */
export async function sendToHandle(handle: string, text: string): Promise<void> {
  if (capture) return capture(handle, text);
  if (!conn) throw new Error('Messaging is not started. Call startMessaging first.');
  let space = spaceByHandle.get(handle);
  if (!space) {
    space = await conn.openDm(handle);
    spaceByHandle.set(handle, space);
    if (conn.provider === 'terminal' && !handle.startsWith(TERMINAL_PREFIX)) {
      handleByTerminalChat.set(space.id, handle);
    }
  }
  await space.send(text);
}

export async function stopMessaging(): Promise<void> {
  await conn?.stop();
  conn = undefined;
}
