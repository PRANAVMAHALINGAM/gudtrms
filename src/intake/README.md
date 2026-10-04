# intake: the chat agent (owner: Pranav)

The only agent a person talks to (AGENTS.md section 6, "Chat agent"). One LLM context per person, built only from that person's rows plus shared facts. Uses `llm()` from `src/llm/`.

- `index.ts`: `startIntake(me)` (fixed intro, no LLM) and `handleAgentMessage(me, text)`, both called by the router. Per message: load state → one LLM call with the tools for the case's stage → run the tools → reply (a short follow-up call writes the reply if a tool failed or none came back) → then act (`onIntakeDone` / `runNegotiation`). `cleanReply()` makes sure no tool-call markup or notes-to-self ever reach a person.
- `store.ts`: Neon access, scoped to one person. `missingSteps()` is the code-side checklist (items → values per outcome → deposit → window → cap → dealbreakers/preferences), so code decides what to ask next and the LLM only words it.
- `tools.ts`: the only way the LLM changes data. Every tool validates in code. Stage decides the tool set: `intake` gets the recording tools + `finish_intake`; `needs_relaxation` (after a relaxation ask or a NO) gets the change tools + `try_again`; `awaiting_confirmation` only gets `reply`.
- `prompt.ts`: the system prompt. Never contains the other person's private data, because it's never loaded.

Shared facts only ever reach the other person as fixed text: item names (when one is added after they finished), the deposit contribution, and the lease-break fee.

Tables (`db/chat-schema.sql`, add with `npm run db:migrate`): `chat_messages` (each person's own thread) and `chat_state` (progress flags). Both PRIVATE.

Run `npm run sim:intake` to play Alex and Sam through the real agent with the section 8 numbers (costs a few cents). `npm run sim:router` uses `LLM_PROVIDER=fake` instead, so it stays free and repeatable.
