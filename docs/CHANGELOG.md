# Changelog

Newest on top. Add an entry after **every** change (code or decisions). If git flags a conflict here because two people logged at once, keep both entries.

**Format**
```
### YYYY-MM-DD HH:MM ET · your name
- What changed
- Why
- Files touched (if code)
```

---

### 2026-10-03 17:02 ET · Shruti
- **Rogue mode is in.** `ROGUE_MODE=B` (or `A`; `true` means B) makes that advocate try once, on the first proposal, to send "what's Alex's max payment?" across. The protocol gate (`src/engine/protocol.ts`) only lets `{ type: 'accept' | 'reject' }` cross and refuses everything else, including a decision with a reason attached. The deal itself is unaffected.
- **Where the blocked message goes:** `leak_events` gets the reason only (`BLOCKED: free text not allowed (from B's advocate)`), never the content, per section 7. The attempted question goes in the rogue advocate's own `advocate_notes` (judge view only), so the judge view can show it in that side lane and the BLOCKED line in the middle.
- Every advocate decision now goes through the same gate before it's written to `decisions`.
- Checked on Neon: with rogue mode on, one `leak_events` row and the deal still lands in round 2; with it off, none. `npm run demo:negotiate` now prints `leak_events`.
- Documented `ROGUE_MODE` and `DEMO_PACING_MS` values in `.env.example`.
- Updated my rows in the section 11 status table.
- Files: `src/engine/protocol.ts`, `src/engine/protocol.test.ts`, `src/engine/advocate.ts`, `src/engine/index.ts`, `db/negotiate-demo.ts`, `.env.example`, `AGENTS.md` (section 11)

### 2026-10-03 · Pranav
- **Messaging adapter is in** (`src/messaging/`). It's the only code that imports spectrum-ts. API: `startMessaging(onMessage(handle, text))`, `sendToHandle(handle, text)`, `stopMessaging()`. Handles are E.164 phone numbers. Choose the provider with `MESSAGING_PROVIDER=terminal|imessage` (new in `.env.example`).
- The terminal provider supports several chats, so texting a new number opens a new chat window for it. You can play A and B in one terminal, with no dev shim.
- Messages are queued per handle: one person's messages run in order, and a slow LLM call for A doesn't block B. Message text is never logged.
- `sendTo` now looks up the participant's handle in Neon and sends through the adapter. The leak filter is still a TODO.
- `normalizePhone()` turns typed numbers into E.164 (assumes US), with tests.
- `src/index.ts` echoes for now, plus `ping <number>` to test texting someone first. The router replaces this.
- Tested on the terminal provider (Windows). iMessage is typechecked but not run yet, because we don't have Spectrum keys.
- Files: `src/messaging/index.ts`, `src/messaging/phone.ts`, `src/messaging/phone.test.ts`, `src/messaging/README.md`, `src/privacy/sendTo.ts`, `src/index.ts`, `.env.example`, `AGENTS.md` (section 11 status)

### 2026-10-03 16:30 ET · Shruti
- **`negotiate()` is real** (replaces the stub, same signature). It loads the case from Neon, the mediator proposes, and both advocates decide, for up to 5 rounds (`ROUND_CAP`). Every proposal, decision, and advocate note is written as it happens so the judge view can poll it. `DEMO_PACING_MS` > 0 waits between moves; leave it at 0 when not demoing.
- **Checked on Neon:** the demo case gives round 1 rejected ($1,615), round 2 agreed ($1,390, Nov 30), exactly as in section 8. With caps on both sides it stops after 5 rounds, sets `needs_relaxation`, and asks both people.
- **Pranav, three things for your side:**
  - On `agreed`, the case status is left alone. You send the agreement and set `awaiting_confirmation`. On `needs_relaxation`, `negotiate()` sets the status itself.
  - When someone relaxes a constraint, **update their existing constraint row**; don't insert a second one. Advocates apply every cap row they see, so the old, stricter cap would still win.
  - Rounds keep counting across calls (a call after relaxation starts at round 6), and each call gets its own 5 rounds.
- If the move-out windows don't overlap, there's no proposal at all. The person whose window ends first is asked to stretch it by a fixed 14 days, never to the other person's date, which would leak it.
- New `npm run demo:negotiate`: runs `negotiate()` on the seeded demo case and prints what crossed the wire. Run `npm run db:reset` first.
- Files: `src/engine/index.ts`, `db/negotiate-demo.ts`, `package.json`

### 2026-10-03 16:25 ET · Shruti
- **Neon is live.** Project `gudtrms` with branches `production` (kept clean for the demo), `shruti`, and `pranav`, all set to never auto-delete. `npm run db:reset` checked against Neon: every table is created and the demo case `4F7K` loads. Pranav: I'll add you to the project; copy the connection string for the `pranav` branch into your own `.env`.
- **`date` columns now come back as `'YYYY-MM-DD'` strings**, not JS `Date` objects, matching `IsoDate` in `src/shared/types.ts`. A `Date` can print as the wrong day depending on timezone (bad for "moves out by Nov 30").
- Files: `src/db/client.ts`

### 2026-10-03 16:15 ET · Shruti
- **Advocates are in** (`src/engine/advocate.ts`). Pure, deterministic. `decide(view, terms)` accepts only if the total paid is within the cap, every dealbreaker is met, the move-out date is in the window, and the deal gives at least the fair share (deposit excluded). It returns the one-line note for `advocate_notes`, e.g. `Total $1,615 is over my $1,600 cap. REJECT`. On a reject, the note lists only what failed.
- `relaxAsk(view, rejected)` gives the smallest single change that would have made a rejected proposal pass for this person (smallest cap raise first, then window, then dealbreaker), in the `RelaxAsk` shape from the contract. Returns null if that person didn't block anything.
- An advocate throws if it's handed any valuation or constraint that isn't its own person's.
- Moved the per-person value math (`valueLookup`, `fairShare`, `received`) into `src/engine/values.ts` so the mediator and advocates share it. No behavior change.
- Tests: Alex rejects round 1 and accepts round 2, Sam accepts both; dealbreaker, window, relaxation (Alex is asked about $1,615), and the private-data guard.
- `negotiate()` is still the stub; wiring it to Neon is next.
- Files: `src/engine/advocate.ts`, `src/engine/advocate.test.ts`, `src/engine/values.ts`, `src/engine/mediator.ts`

### 2026-10-03 16:08 ET · Shruti
- **Mediator is in** (`src/engine/mediator.ts`). It's pure: no DB, no LLM. `candidates(input)` yields deals best total value first, each with its Knaster buyout, the deposit line, the move-out date, and a `math` object (fair shares, received, excess, surplus) for the judge view's math panel. Its input type has no field for caps or dealbreakers, so it can't see them.
- Handles all item kinds: stuff, subscriptions (cancelled when nobody wants it), lease (A stays, B stays, or both move out), lease-break fee (only when both move out, goes to whoever minds paying it least), and pets (4 outcomes). Missing valuations count as $0; a missing fee valuation defaults to paying the whole fee.
- **Tie rule:** options worth the same to both people are collapsed, and "cancelled" / "both move out" win ties. Without this, the $0 Spotify would tie for round 2 ("Alex keeps Spotify") and the demo would land in round 3.
- Tests reproduce the section 8 table exactly (round 1 $865 + $750 = $1,615, round 2 $640 + $750 = $1,390, Nov 30), plus both-move-out with a fee, no window overlap, and "both end the same amount above fair share."
- `negotiate()` is still the stub. Advocates and wiring it to Neon come next.
- Files: `src/engine/mediator.ts`, `src/engine/mediator.test.ts`

### 2026-10-03 17:05 ET · Shruti
- **Scaffold is in.** Node + TypeScript via `tsx` (no build step). Neon via `@neondatabase/serverless`, Photon via `spectrum-ts`. Pull, run `npm install`, and start in your own folders.
- `db/schema.sql` (section 7 as SQL) and `npm run db:reset`, which **wipes** the database and loads the demo scenario. Use your own Neon branch. Checked on in-memory Postgres; not yet run against Neon.
- `src/shared/`: `types.ts` (row types; `Transfer` amounts are netted into one direction), `contract.ts` (`Negotiate`, `SendTo`, `RelaxAsk`), `demoScenario.ts` (the section 8 data with fixed ids, plus a test).
- Stubs: `negotiate()` in `src/engine/index.ts` (gives everything to A and always agrees) and `sendTo()` in `src/privacy/sendTo.ts` (prints instead of sending). Replace them, but keep the names and signatures.
- `src/index.ts`: Photon hello world on the terminal provider (works); the iMessage config is in a comment. Owner folders have READMEs; `README.md` has setup steps and the layout.
- Files: `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`, `db/`, `src/`, `judge/README.md`, `README.md`

### 2026-10-03 16:40 ET · Shruti
- **Split the work.** Pranav takes the conversation side: Photon, router, intake agent, agreement/YES/relaxation messages, leak filter. Shruti takes the negotiation side: Neon schema + seed, mediator, advocates, rogue mode, judge view.
- Defined the contract between the halves: `negotiate(caseId)` (Shruti) and `sendTo(participantId, text)` (Pranav), plus the Neon tables. Sync points are at ~11 PM and ~3 AM.
- Diagram + timeline: https://claude.ai/artifact/MRD8VTJcSoxGVtZPUQsLLP
- Files: `AGENTS.md` (section 11)

### 2026-10-03 16:10 ET · Shruti
- **Lease-break fee is valued like any other item** (we decided against a flat 50/50 split). It only exists if both move out. The fee amount is a fact both confirm, and each person says what taking on the whole fee would cost them (defaults to the fee). It goes to whoever minds paying it least, and the buyout compensates them. Its negative value also makes "both move out" less attractive, so the mediator only picks it when it's still the best option after the fee.
- Why: a split that ignores the fee could pick "both move out" even when the fee makes staying the better deal.
- Schema: new item kind `lease_break_fee` with `items.amount_cents`; valuation outcome `pay`.
- Files: `AGENTS.md` (sections 5, 6, 7, 10)

### 2026-10-03 16:00 ET · Shruti
- **Both people can move out.** The lease now has three outcomes: A stays, B stays, or both move out. Each person values staying compared with both leaving (it can be negative). If neither puts a positive number, both move out.
- **Deposit when both move out:** the landlord's refund is split in proportion to what each person paid, deductions are shared the same way, and whoever receives it sends the other their share. It doesn't count toward anyone's payment cap. When one person stays, nothing changes (the person staying pays the other back now).
- Added an example agreement for the both-move-out case. New open question: lease-break fees.
- Why: separate places is a common outcome, and the old spec assumed one person always keeps the lease.
- Files: `AGENTS.md` (sections 5, 6, 7, 10)

### 2026-10-03 15:45 ET · Shruti
- **Demo conflict:** added a checked demo scenario to section 8. Round 1 is rejected (Alex's total of $1,615 is over the $1,600 cap) and round 2 is agreed ($640 buyout + $750 deposit). For a reject to be possible, the **mediator no longer sees payment caps or dealbreakers**; only advocates do (privacy rule 1, which is stricter now).
- **Move-out date is part of the deal:** each person gives a window, and the mediator picks the latest date inside both. Added `proposals.move_out_date`.
- **Pets can be shared:** four outcomes (A full-time, A + B every other weekend, the reverse, B full-time). Each person values each one, and Knaster is generalized to pick the outcome with the highest total value. `valuations` gains an `outcome` column.
- **Dropped the "okay to share" flag.** Everything is private except deposit contributions. Removed the `visibility` columns.
- **Leak filter:** numbers and dates from this case's proposals or agreement are exempt, so the filter doesn't block the agreement. It only matches dollar amounts and dates, and a person's own numbers are always allowed.
- **`YES` only counts** once the agreement has been sent to that person (`awaiting_confirmation` replaces the `agreed` status). Added a router table of which keywords count in which state. `STOP` always works.
- **Deposit and subscriptions:** the deposit is no longer an item. Whoever keeps the lease pays back the other person's contribution as a separate line (new `deposit_contributions` table). Subscriptions are items whose keeper takes over billing; values can be negative, and the subscription is cancelled if nobody wants it. The cap is now on total payment (`max_payment_cents`).
- Added `.gitignore` (`.env`, `node_modules`, build output, logs, OS/editor files).
- New open question: what happens if someone replies `NO` to the agreement.
- Files: `AGENTS.md` (sections 4, 5, 6, 7, 8, 9, 10), `.gitignore`

### 2026-10-03 15:20 ET · Shruti
- **Switched messaging back from WhatsApp to iMessage** (still Photon Spectrum). The terminal provider is still for dev, and Telegram is still the fallback.
- Why: we want gudtrms to invite Person B directly. iMessage lets us text B first with no approvals. WhatsApp needs a Meta-approved template plus a test-number allowlist. Telegram bots can't message anyone who hasn't opened the bot first. SMS needs US carrier registration that takes days to weeks. The trade-off is iPhone only. The full comparison is in `AGENTS.md` section 3, "Why iMessage."
- Replaced "WhatsApp notes" with "iMessage notes" (shared-pool lines, how to text first, the 50-new-conversations-per-day limit). The invite is now a plain fixed text instead of a template. All invite guardrails are kept (one invite, `STOP` opt-out, no free text from A).
- New open questions for the Photon booth: SMS/RCS fallback for Android, and texting new numbers on the free plan.
- Files: `AGENTS.md` (header, rules, sections 1, 3, 5, 6, 7, 9, 10)

### 2026-10-03 15:00 ET · Shruti
- **gudtrms now invites Person B directly** instead of A forwarding a message. A gives B's number, and gudtrms sends one Meta-approved invite template. B replies `JOIN` to take part or `STOP` to opt out permanently. The case code stays as a backup.
- Guardrails: one invite per case with no reminders, fixed invite text (A can't add any), a global `opt_outs` list, and A only learns "waiting" or "didn't join."
- Why: people splitting up often aren't speaking. The guardrails keep this within WhatsApp's opt-in policy and stop it from being used to get around a block.
- Schema: `cases.status` gains `inviting`; `participants` gains `invite_sent_at` and `joined_at`; new `opt_outs` table.
- Files: `AGENTS.md` (sections 3, 5, 6, 7, 10)

### 2026-10-03 14:30 ET · Shruti
- **Switched messaging from iMessage to WhatsApp.** Still Photon Spectrum, now using its WhatsApp Business provider (official WhatsApp Business Cloud API). Terminal provider for dev and Telegram fallback are unchanged.
- Added a "WhatsApp notes" section: Meta credentials (access token, phone number ID, app secret), 1:1 only, the 24-hour reply window, the test-number allowlist, and inbound delivery (cloud mode vs. ngrok).
- Why: easier for the team to work with, and it works on Android and iPhone.
- Files: `AGENTS.md` (header, rules, sections 1, 3, 6, 7, 9, 10)

### 2026-10-03 14:25 ET · Shruti
- Added the **judge view** spec: a localhost-only page with three lanes (Advocate A | what crosses | Advocate B), an X-ray toggle that unblurs the private lanes, demo pacing, animated flow, a math panel, and rogue-mode display. Replaces the old "demo web page."
- Added an `advocate_notes` table for each advocate's one-line reasoning per decision. Only the judge view reads it; `decisions` stays reason-free.
- Privacy rule 1 now names the judge view as the only exception (demo tool, fake data, never deployed).
- Why: judges need to see the agents negotiate, and seeing the secrets stay in their lanes proves the privacy claim.
- Files: `AGENTS.md` (sections 4, 6, 7, 8, 9, 11)

### 2026-10-03 14:00 ET · Shruti
- Project kickoff. Added `AGENTS.md` with all decisions so far: scope, Photon + Neon stack, per-person advocates with a mediator, privacy rules, user flow, architecture, data model, build plan, and ownership. Added `CLAUDE.md` (imports `AGENTS.md`) and this changelog.
- Proposed implementation details (Knaster's procedure, round cap of 5, schema) are open for the team to confirm or change.
- Files: `AGENTS.md`, `CLAUDE.md`, `docs/CHANGELOG.md`
