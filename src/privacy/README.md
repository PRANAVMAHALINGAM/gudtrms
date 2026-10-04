# privacy: the outbound path and the leak filter (owner: Pranav)

Every message to a person goes through here (privacy rule 5, AGENTS.md section 6).

- `sendTo(participantId, text)`: fixed-template text (agreement, relaxation asks, notices). Number/date check. If blocked, the person gets a safe generic line instead.
- `sendAgentReply(participantId, text)`: LLM-written chat-agent replies. Number/date check **and** the LLM check. Returns `false` if blocked, so the chat agent rewrites once (no specific amounts or dates, nothing about the ex), then falls back to a safe line.
- A blocked message is never sent or stored. `leak_events` gets the reason only (e.g. `BLOCKED: message to B had one of A's private amounts (number check)`), never the text or the value.

## The two checks

1. **Number/date check** (`leaks.ts`, code, instant). Finds every dollar amount (`$1,500`, `1500 dollars`, `1.5k`) and date (`Nov 30`, `30th of November`, `11/30`, `2026-11-30`) in the text. Blocks any that is one of the **other** person's private values (valuations, cap, window), unless it's also allowed: the recipient's own numbers, deposits and the lease-break fee (shared), anything in this case's proposals or agreements, or anything the recipient said themselves. `$0` and bare numbers ("round 2") never count.
2. **LLM check** (`leakFilter.ts`, ~1.5-2.5s, agent replies only). Catches words, not numbers: "Alex really wants the dog", "I doubt they'll budge". The checker's prompt has the outgoing message, the recipient's **own** answers (so a recap of them reads as fine), shared facts, the agreement, and worked examples. **Never the ex's data**, so no prompt ever holds both people's private data (rule 1). Claude reasons in a sentence, then ends with `VERDICT: YES/NO`; anything unclear blocks (fails closed).

Settings in `.env`: `LEAK_LLM_CHECK=on|off`, `LEAK_LLM_EFFORT=medium|low`, `LEAK_DEBUG=1` (prints blocked text; fake data only).

## Checking it

- `npm test`: the number/date parsing and matching.
- `npm run leak:check`: 12 messages to Sam in the seeded demo case through both checks with real Claude: 4 planted leaks must be blocked, 8 normal messages (own numbers, shared facts, agreement terms, long recaps) must go through. Nothing is sent or logged.
- `npm run sim:intake`: a whole real conversation must produce 0 blocks.
