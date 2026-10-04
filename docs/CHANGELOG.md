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

### 2026-10-04 00:30 ET · Pranav
- **Chat agent is in** (`src/intake/`, per Shruti's section 6 spec), replacing the stub. One LLM context per person, built only from that person's rows + shared facts. Handles intake, soft preferences (`constraints` kind `other`), replies to relaxation asks **and** to a NO, and questions about a sent agreement.
  - Code-led: `missingSteps()` decides what to ask next (items → values per outcome → deposit → window → cap → dealbreakers/preferences); the LLM words it and records answers through validated tools (`tools.ts`). It can only change data through tools, and only its own person's rows plus the shared item list.
  - Relaxation / after a NO: change tools (value, cap, window, drop a dealbreaker) **update the existing row**, then `try_again` runs `runNegotiation()`. It refuses to re-run if nothing changed (same inputs = same deal).
  - Shared facts reach the other person only as fixed text: deposit contribution, lease-break fee, and an item added after they finished (which also reopens their intake).
  - `cleanReply()` strips tool-call markup and notes-to-self the model sometimes writes into its text; both leaks showed up in testing and are now covered by tests.
- **Tested with real Claude:** `npm run sim:intake` plays Alex and Sam with the section 8 numbers in plain language. All values, deposit, windows, cap and dealbreaker land exactly; negotiation runs by itself and sends the $640 / $1,390 agreement; then Alex says NO, raises the cap to $1,700, and the new agreement is the $865 / $1,615 one. 29 turns, median reply 3.4s, nothing tag-like reached anyone. Costs a few cents per run.
- New PRIVATE tables `chat_messages` (each person's own thread) and `chat_state` (progress flags) in `db/chat-schema.sql`. **Shruti:** `npm run db:migrate` adds them to your branch without touching data; `db:reset` now runs that file too (I added one line to `db/reset.ts` and the two tables to the drop list in `db/schema.sql`). The judge view must not read them.
- `sendTo` and the router now record every message in that person's thread. `LLM_PROVIDER=fake` (always "[agent] ok") keeps `npm run sim:router` free and repeatable.
- Files: `src/intake/{index,store,tools,prompt}.ts`, `index.test.ts`, `README.md`, `src/privacy/sendTo.ts`, `src/router/index.ts`, `src/llm/index.ts`, `db/chat-schema.sql`, `db/migrate.ts`, `db/intake-sim.ts`, `db/router-sim.ts`, `db/schema.sql`, `db/reset.ts`, `package.json`, `AGENTS.md` (sections 7, 11)

### 2026-10-03 23:05 ET · Shruti
- **Pets can be split 50/50 (spec only, build after the ~3 AM full run).** Fifth pet outcome: week on, week off. Each person values it (new valuation outcome `split`), and the allocation marks it `{ to: null, weekends: null, split: true }`.
- Rules: 50/50 does **not** satisfy a "lives with me" dealbreaker. A pet's fair share uses the person's highest pet value (normally full-time). Other arrangements people describe ("70/30") get mapped to the closest of the five by the chat agent; the mediator only knows these.
- Demo seed gets Biscuit 50/50 = Alex $500, Sam $300 (total $800, $250 below the best). Rounds 1 and 2 stay exactly as before; the 50/50 total must stay under $1,000 or it ties with round 2.
- **Pranav:** intake asks four pet numbers instead of three, and the agreement writer needs the line "Biscuit splits time 50/50: one week with X, then one week with Y." Not urgent, after the full run.
- Files: `AGENTS.md` (sections 5, 6, 7, 8, 11)

### 2026-10-03 22:59 ET · Shruti
- **Agents are now real LLM agents (spec only, no code yet).** Until now, the "agents" were plain functions: `decide()` called with each person's filtered data. AGENTS.md now has a multi-agent design:
  - **Two LLM agents per person, each in its own LLM context:** a **chat agent** (intake, relaxation replies, soft preferences; Pranav) and an **advocate agent** (judges each proposal; Shruti). No prompt ever holds both people's private data (privacy rule 1).
  - **The advocate decides through tools.** `check_proposal` runs today's deterministic checks as a **hard veto** it can't override. If every check passes it may still reject, but only by naming one of its person's `other` soft preferences. It writes its own inner monologue. If the LLM fails, times out, or refuses, it falls back to `decide()`. `ADVOCATE_MODE=rules` turns the LLM off.
  - **The mediator stays code** (fair, reproducible, and an LLM mediator would need both people's data in one context).
  - **Rogue mode gets real:** the rogue advocate writes its own question with `send_to_other_side`, and the protocol gate still blocks it. Pitch line: "the agents are smart, the wire is dumb."
  - The demo stays the same: Alex's round 1 reject comes from the cap veto, and Sam has no soft preferences in the seed, so Sam accepts both rounds.
- `constraints` kind `other` now holds a soft preference `{ text }`, read only by that person's advocate.
- **Section 3's DECIDED "Agents" row changed** from "plain modules" to "multi-agent, no framework". Pranav: please check the chat agent part (section 6) since it reshapes `src/intake/`. Handling the reply to a relaxation ask now sits with the chat agent.
- **Section 11 brought up to date** with everything on the negotiation side (scaffold and spec, Neon branches, mediator, advocate rules, `negotiate()`, rogue mode, judge view), plus new rows for the LLM layer, the chat agent, and the advocate agents (not started).
- Files: `AGENTS.md` (sections 3, 4, 6, 7, 8, 11)

### 2026-10-03 22:40 ET · Pranav
- **AGENTS.md brought up to date with what's done** (docs only, no code):
  - Section 10: checked off "Photon setup" (connected, keys in `.env`, tested on two iPhones; email-only handles don't work) and "does `im.space.create` reach a brand-new number on the free plan" (no: only project users who have texted their line once; Business plan has no allowlist).
  - Section 3, iMessage notes: the "Texting first" note now says the same, since the old text implied we can text anyone. The decision to use iMessage is unchanged.
  - Section 11: router row includes NO and the two-iPhone test; intake and leak filter rows note that the LLM layer (`src/llm/`, `askYesNo()`) is ready.
- Still open in section 10: Android fallback, prize requirements, and whether both people approve the item list.

### 2026-10-03 22:15 ET · Pranav
- **Decided (team call): NO to the agreement = back to the table** (AGENTS.md sections 5, 6, 10). A bare `NO` / `nope` / `nah` / `n` while `awaiting_confirmation` supersedes the deal and moves the case to `needs_relaxation`. The person who said NO is asked privately what doesn't work. The other is told only "They didn't confirm yet. I'm working on a new version." A new agreement gets a new row, so both YESes start over. "no way, the couch is mine" is not a keyword; it goes to the agent. Code: `declineAgreement()` in `src/conversation/confirm.ts`, router hook, scenario 5 in `npm run sim:router` (passes).
- **Shruti:** after a NO, the latest `agreements` row stays (with whatever YES it had) and its proposal is `superseded`, until the next agreement row is written. The judge view may want to treat a superseded proposal's agreement card as "declined".
- **Decided: LLM = Claude Sonnet 5.5** (`claude-sonnet-5-5`) at low effort: fast and cheap enough for iMessage chat, and low is Anthropic's recommended effort for chat on Sonnet 5.5 (its own default is high, so we always send effort explicitly). New `src/llm/`: a provider-neutral `LlmProvider` interface (stateless `chat()` with tools → reply text + tool calls) plus `askYesNo()` for the leak filter. `claude.ts` is the only file that imports `@anthropic-ai/sdk`; it uses strict tool schemas, caches the system prompt, and opts into server-side refusal fallback. Grok or Gemini later = one new file in `src/llm/` + `LLM_PROVIDER`. `LLM_MODEL` / `LLM_EFFORT` override the defaults.
- `.env.example`: `LLM_API_KEY` replaced by `LLM_PROVIDER`, `LLM_MODEL`, `LLM_EFFORT`, `ANTHROPIC_API_KEY`. **Add `ANTHROPIC_API_KEY` to your `.env`**, then `npm run llm:check` (two tiny calls: a tool call and a yes/no).
- Files: `src/conversation/confirm.ts`, `src/router/index.ts`, `src/router/keywords.ts`, `keywords.test.ts`, `db/router-sim.ts`, `src/llm/*` (new), `package.json` (`@anthropic-ai/sdk`, `llm:check`), `.env.example`, `AGENTS.md` (sections 3, 5, 6, 10)

### 2026-10-03 21:42 ET · Shruti
- **All judge-view text fits its box.** Fixed every overflow an automated check found, stepping through all 14 steps both redacted and declassified: the "What it's worth" cards, the "Is it fair?" and leak log footer cards, the proposal card's DEAL / NO DEAL seal, and the items after a NO DEAL running toward the footer (they now sit three across in compact cards while a proposal shows). The footer is a little taller.
- **Scroll as a safety net:** every side card, footer card, the agreement's list of terms, and a moving box holding more than six items scroll instead of spilling, so longer live data (names, more items) stays inside. With the demo data nothing needs to scroll. Long words wrap inside cards.
- Checked at 900x1300, 1280x720, 1600x900, and 2560x1080: the whole stage stays on screen and in proportion.
- **The line is now duct tape:** gray with a silver sheen, a woven texture, creases, wavy edges, and three crooked extra pieces stuck on at angles. Breakups are messy. The crooked pieces fall off when it tears at the end.
- **Favicon:** 🤝 (inline SVG, no file).
- **Follow-up:** Alex's deposit card was spilling out of the moving box, because four items need two rows and the box only fit about one and a half. The box now fits exactly two rows. Up to 4 items get two wide cards per row (names in full); more get three narrower cards per row, and past 6 the box scrolls. Names and tags in a box stay on one line each (full text on hover); compact tape cards wrap to two lines. The deposit's label is shorter ("Deposit" · "$1,500 · on Alex's lease").
- **Follow-up:** the "Parted on gudtrms." card is smaller, and at the tear the sides ease inward instead of sliding out, so they keep about 50px from the screen edge (they used to almost touch it). A check across every step finds no overflow, no truncated text, and nothing reaching the footer.
- Files: `judge/index.html`, `judge/src/theme.css`, `judge/src/App.tsx`, `judge/src/components/{Side,Items,TapeZone,Chrome,Overlays}.tsx`

### 2026-10-03 21:23 ET · Shruti
- **Judge view restyled: lighter, more elegant, evenly spaced.** The dark crimson and hot pink read as shady, so it's now warm linen and paper with white cards and soft shadows, Fraunces (an editorial serif) for headings with Inter for body text, terracotta as the accent, sage for accept / deal, and brick for reject / no deal / blocked. Words and icons still carry every meaning, not just color.
- **One spacing scale** (8 / 16 / 24 / 32 / 40px), used everywhere: a 40px page margin, a 32px gap between all three columns and between the footer cards, and 16px between cards. Both sides use fixed card heights, so they mirror exactly.
- Each side is a Pinterest-style set of cards: values and hard limits side by side, then the advocate's notes, then the moving box. Redaction is now document-style charcoal bars inside each card with a small "Private" label. Stamps are double-ruled serif seals. The IOU and keys pin onto the taped boxes at the end.
- The closing line is now **"Parted on gudtrms."**, styled like the header wordmark (upright "gud", italic terracotta "trms").
- Same behavior, data, and shortcuts. Fonts swapped: Anton, Permanent Marker, and Bricolage out; Fraunces in.
- Files: `judge/src/theme.css`, `judge/src/main.tsx`, `judge/src/App.tsx`, `judge/src/components/*`, `judge/package.json`

### 2026-10-03 21:10 ET · Shruti
- **Judge view is in** (`judge/`). Run it with `npm run judge:install` (once), then `npm run judge` → http://127.0.0.1:5199. Vite + React + Framer Motion, with its own `package.json` inside `judge/`, so none of its dependencies land in the root.
- **Theme:** two exes splitting up. Masking tape down the middle is the privacy line ("What crosses the line"). Shared items start on the tape and fly into each ex's moving box. The buyout is a handwritten IOU. Dark crimson base with hot pink and red accents, kraft and tape textures. Laid out at 1920x1080 and scaled to fit any screen. Fonts are bundled, so it works offline.
- **Moments:** Declassify (`X`) rips black redaction bars off both sides. Proposals slam in, then DEAL or NO DEAL stamps land (NO DEAL shakes the screen and snaps the items back). The rogue message hits the tape and gets stamped BLOCKED. The agreement card's signatures fill in as each person replies YES, then the screen tears along the tape: boxes get taped shut, the keys fly to whoever keeps the apartment, the IOU pins to the payee's side, and it ends on "Parted on good terms." Synthesized sound effects (mute with `M`).
- **Interactive:** replay (`R`), play/pause (`Space`), step (`←` `→`), 1x/2x speed, a timeline scrubber over every step, click any item for both exes' values and why it went where it did, an "Is it fair?" breakdown with animated bars (`F`), a fairness playground in mock mode that re-runs the real mediator live, and `?` for shortcuts.
- **Data:** Mock mode runs the real mediator and advocates from `src/engine` in the browser on the section 8 demo, so it can't drift from the engine. Live mode polls `GET /api/snapshot` every second. It reads Neon inside one `READ ONLY` transaction per poll, binds to 127.0.0.1 only, never logs row contents, and can use an optional read-only role via `JUDGE_DATABASE_URL`.
- **Checked:** mock plays through all 14 steps with the section 8 numbers (round 1 $1,615 NO DEAL, round 2 $1,390 DEAL, +$235 each, $470 surplus). Live followed a real paced rogue-mode `negotiate()` on my Neon branch end to end. The playground recomputes correctly ($400 TV gives $1,652.50).
- **Pranav:** signatures and the tear play when `agreements.a_confirmed` / `b_confirmed` turn true. Until the `agreements` row exists, the card shows the accepted proposal with "waiting for YES". If `agreements.text` is set, the card shows your text instead of generating its own.
- Files: `judge/*` (new), `package.json` (`judge`, `judge:install` scripts), `.env.example` (`JUDGE_DATABASE_URL`), `AGENTS.md` (section 11 status)

### 2026-10-03 20:30 ET · Pranav
- **Agreement writer is in** (`src/conversation/agreement.ts`). Renders the accepted proposal into the section 5 text from fixed templates (no LLM): lease + move-out date, lease-break fee, buyout, deposit payback or refund split, total, items, pets, subscriptions. Unit test checks the demo deal against the section 5 Alex/Sam example word for word, plus a both-move-out case. Sends to both, then inserts the `agreements` row and sets `awaiting_confirmation`.
- **`runNegotiation(caseId)`** (`src/conversation/negotiation.ts`) wraps Shruti's `negotiate()`: only runs from `intake` / `needs_relaxation`, ignores "already being negotiated". `agreed` → agreement to both. `needs_relaxation` → each person's private ask, sent to both at once ("Would you go up to $X in total? Totally fine to say no..."); whoever has nothing to relax gets a neutral "nothing fits yet" with no numbers. `onIntakeDone(caseId)` is the hook the intake agent will call.
- **11 PM sync point passes:** `npm run demo:agreement` runs the seeded case 4F7K: round 1 REJECT, round 2 agreed, the exact section 5 agreement to both, both YES, case closed. It resets only the demo case's negotiation rows first, so it can be re-run. (It leaves the demo case `closed`; run it again or `db:reset` before `demo:negotiate`.)
- **Tested on two real iPhones:** `npm run demo:phones -- <case code>` loads the section 8 demo values into a real joined case (A gets Alex's, B gets Sam's), negotiates, texts the agreement to both, and keeps running as the bot. Both phones got the agreement; a non-bare "yes" didn't count, a bare `YES` from each did, and the case closed. Added `whenConnected()` to the messaging adapter for scripts that send before any message arrives.
- Open: what a `NO` to the agreement does (AGENTS.md section 10). Today it just leaves the case in `awaiting_confirmation`. Proposal: decline → back to `needs_relaxation`, ask that person privately what doesn't work, tell the other only "they didn't confirm yet". Needs a team call.
- Not done yet: handling someone's reply to a relaxation ask. That's free text, so it goes with the intake agent.
- Files: `src/conversation/agreement.ts`, `agreement.test.ts`, `negotiation.ts`, `negotiation.test.ts`, `README.md`, `db/agreement-demo.ts`, `db/phone-demo.ts`, `src/messaging/index.ts`, `package.json`, `AGENTS.md` (section 11 status)

### 2026-10-03 19:30 ET · Pranav
- **Router is in** (`src/router/`), replacing the echo in `src/index.ts`. Handles `start` → A's name → ex's name + number → the one fixed invite; `JOIN` or the case code; `STOP` (opt-out list, closes the case, tells the other side only "they didn't join" / "the case ended"); `YES` once the agreement has been sent. Everything else goes to the intake agent, which is a stub for now (`src/intake/index.ts`, same signatures the real one will use).
- Privacy choices: one generic "can't invite that number" reply whether the number opted out, is A's own, or is already in a case, so A can't probe. Someone who said STOP gets no replies unless they text `start` or a code themselves (that opts them back in). Case codes always contain a digit so they can't spell JOIN/STOP.
- If Photon refuses the invite (number not a project user yet, see the Photon notes below), A gets the case code to pass on; B can join by texting it from any number.
- **YES confirmation** in `src/conversation/confirm.ts`. **Agreement writer: insert the `agreements` row only after sending the text to both people.** That row is how the router knows YES counts.
- `npm run sim:router` plays both people through every flow against Neon with fake +1555020xxxx numbers and checks each reply. Cleans up after itself; doesn't touch the demo seed. All passing. New `captureOutbound()` in the messaging adapter makes this possible.
- Ran `db:reset` on my own (empty) Neon branch to create the schema.
- **Tested on two real iPhones over iMessage:** A texted `start`, gave their name and B's (+91) number, B got the invite and replied `JOIN`, case went to `intake`, both got the intake intro. No errors.
- Files: `src/router/*`, `src/intake/index.ts`, `src/conversation/confirm.ts`, `src/index.ts`, `src/messaging/index.ts`, `src/messaging/README.md`, `db/router-sim.ts`, `package.json`, `AGENTS.md` (section 11 status)

### 2026-10-03 18:45 ET · Shruti
- **Re-checked everything on my side:** typecheck (no unused code), all 20 tests, and the demo on Neon (normal and rogue) all pass and match section 8.
- **Fixed: `negotiate()` could run twice on one case.** The messaging adapter handles A's and B's messages in parallel, so if both finish intake at the same moment, both could call it and write duplicate rounds. Now it claims the case first (`intake` / `needs_relaxation` → `negotiating`, atomically). A second call throws "already being negotiated by another call", which is safe to ignore. If a run fails mid-way, the case goes back to its previous status and any half-written proposal is marked `superseded`. Checked on Neon with two simultaneous calls and with a forced failure.
- **Pranav:** call `negotiate()` only when the status is `intake` or `needs_relaxation`. The rules for calling it are now in `AGENTS.md` section 11 (contract), not just here, including that `buyout_cents` and `deposit_cents` in `transfer` can point opposite ways (`total_cents` is the net).
- The demo seed's case status is now `intake` (both finished intake), not `negotiating`, so `negotiate()` can claim it.
- Docs: `AGENTS.md` sections 7, 8, 11 (rogue mode and `negotiate()` rules), `README.md` (no longer says the engine is a stub; adds `npm run demo:negotiate`).
- Files: `src/engine/index.ts`, `src/shared/demoScenario.ts`, `AGENTS.md`, `README.md`

### 2026-10-03 17:02 ET · Shruti
- **Rogue mode is in.** `ROGUE_MODE=B` (or `A`; `true` means B) makes that advocate try once, on the first proposal, to send "what's Alex's max payment?" across. The protocol gate (`src/engine/protocol.ts`) only lets `{ type: 'accept' | 'reject' }` cross and refuses everything else, including a decision with a reason attached. The deal itself is unaffected.
- **Where the blocked message goes:** `leak_events` gets the reason only (`BLOCKED: free text not allowed (from B's advocate)`), never the content, per section 7. The attempted question goes in the rogue advocate's own `advocate_notes` (judge view only), so the judge view can show it in that side lane and the BLOCKED line in the middle.
- Every advocate decision now goes through the same gate before it's written to `decisions`.
- Checked on Neon: with rogue mode on, one `leak_events` row and the deal still lands in round 2; with it off, none. `npm run demo:negotiate` now prints `leak_events`.
- Documented `ROGUE_MODE` and `DEMO_PACING_MS` values in `.env.example`.
- Updated my rows in the section 11 status table.
- Files: `src/engine/protocol.ts`, `src/engine/protocol.test.ts`, `src/engine/advocate.ts`, `src/engine/index.ts`, `db/negotiate-demo.ts`, `.env.example`, `AGENTS.md` (section 11)

### 2026-10-03 · Pranav
- Added `npm run msg:test -- <phone> ["text"]`: texts one number first through the adapter, then exits. Use it to check the Photon line without starting the full app.
- First real iMessage attempt: the Spectrum keys authenticate, but the send fails with `PERMISSION_DENIED: Target not allowed for this project`. The Photon project seems to only text allowlisted numbers, so each demo phone (and B's number) has to be added in the dashboard first (Photon docs confirm this: Free/Pro shared-pool lines only text registered users; Business plan has no allowlist). **Confirmed:** being a user isn't enough. Sends kept failing until Rachel texted her assigned pool line once; right after that, `msg:test` to her went through. So on the shared pool, someone must be (1) added as a project user and (2) have texted their line before gudtrms can text them. Note each user gets their own pool line (`assignedPhoneNumber`), so A and B text different numbers. That clashes with "gudtrms texts B first" for numbers we don't know ahead of time, so ask the Photon booth.
- **Shared pool = phone-number handles only.** Photon auto-replies to email-based iMessage handles (e.g. a Mac signed in with just an Apple ID) that it "can't route it to the right agent." So every demo participant needs an iPhone (or a Mac sending from an iPhone's number). Email handles need the Business plan's dedicated line.
- Non-US numbers work on the shared pool (tested a +91 iPhone both ways). Current test users: Ross (+91) texts on +1 415-202-4086, Rachel texts on +1 628-789-6792.
- **Inbound works too**, but restart the app after adding/removing Photon users: a bot started before Rachel was re-created never saw her texts; a fresh one got her (held) message right away.
- New `MESSAGING_DEBUG=1` flag in the adapter logs connection + per-event metadata (direction, type, sender handle), never message text.
- Files: `src/messaging/send-test.ts`, `src/messaging/index.ts`, `package.json`

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
