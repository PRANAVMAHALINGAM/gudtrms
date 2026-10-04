# conversation (owner: Pranav)

Agreement text (rendered from the accepted proposal), YES confirmation, and relaxation prompts. Everything goes out through `sendTo` in `src/privacy`.

- `negotiation.ts`: `runNegotiation(caseId)` calls `negotiate()` (src/engine). On `agreed` it sends the agreement; on `needs_relaxation` it sends both people their private ask at the same time. `onIntakeDone(caseId)` starts it once both people have `intake_done`; the intake agent calls that.
- `agreement.ts`: `renderAgreement()` fills the section 5 template from the proposal (no LLM). `sendAgreement()` sends it to both, then inserts the `agreements` row and sets `awaiting_confirmation`. The row goes in only after both sends, because the router uses it to decide that YES counts.
- `confirm.ts`: YES handling. Both YES → case `closed`.

Not built yet: handling the person's reply to a relaxation ask (update their existing constraint row, then `runNegotiation` again). It belongs with the intake agent, since the reply is free text.

Run `npm run demo:agreement` to play the seeded demo case through all of this.
