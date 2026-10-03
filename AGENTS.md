# gudtrms

> **gudtrms** = "good terms." An iMessage mediator for breakups where each person gets their own AI advocate, and the deal gets made without anyone's secrets leaking.

**Event:** MHacks 2026 (Oct 3 to 4, 2026, 24 hours, Ann Arbor)

---

## Rules for agents and teammates (read first)

- This file is the **source of truth** for what we're building. Read all of it before starting a task.
- **Before you start:** skim the latest entries in [`docs/CHANGELOG.md`](docs/CHANGELOG.md) to see what teammates just changed.
- **After every change** (code or decisions): add an entry to the top of `docs/CHANGELOG.md`. Keep it short: what changed, why, which files.
- Sections marked **DECIDED** are agreed by the team. Don't change them without a changelog entry explaining why.
- Sections marked **PROPOSED** are implementation suggestions. Change them freely, but log it.
- Never put secrets (Photon project ID/secret, Neon connection string, LLM API keys) in any file in the repo. Use `.env`, and keep `.env` in `.gitignore`.

---

## 1. What we're building (DECIDED)

- **Problem:** married couples get courts and mediators when they split up. Unmarried couples and roommates who live together get nothing, just a fight over the couch.
- **Product:** each person texts gudtrms over iMessage and gets their own **advocate agent**. The two advocates negotiate through a **mediator**, and both people end up with a written agreement covering who keeps what and who owes whom.
- **The key promise:** you can tell your agent the truth, and your ex never sees it. Privacy is enforced by how the system is built, not by trust.

---

## 2. Scope (DECIDED)

**In scope**
- Unmarried couples (and roommates) who lived together and are splitting up. **Exactly 2 people per case in v1.**
- Things to divide: who keeps the apartment/lease, move-out date, buyout amount, shared furniture and items, security deposit, shared subscriptions, pets.

**Out of scope (do not build)**
- Married couples / divorce.
- Children or child custody.
- Co-owned real estate, mortgages, car loans.
- **Payments.** The agreement just states who owes whom. People settle it themselves.
- Legal advice or legally binding documents.

---

## 3. Stack (DECIDED)

| Area | Decision | Why |
|---|---|---|
| Messaging | **Photon Spectrum** (`spectrum-ts`) over **iMessage**, using Spectrum's iMessage provider (cloud lines) | No approvals, and gudtrms can text Person B first. See "Why iMessage" below |
| Dev / fallback | Spectrum **terminal provider** for local dev; **Telegram provider** if the iMessage line is blocked | Same agent code, swap the provider |
| Language | **TypeScript** (Node or Bun) | Photon's SDK is TypeScript |
| Database | **Neon** (hosted Postgres) | Plain Postgres, no learning curve |
| Agents | Advocates + mediator are **plain modules in our backend**, no agent framework | Effort goes into negotiation and privacy |
| Payments | **None** | Not core |
| LLM | **TBD** | See open questions |

**Rejected:** WhatsApp, Telegram as the main channel, and SMS (see "Why iMessage" below), Fetch.ai (whole workflow must live in ASI:One, too much overhead), Relay (users must install an iOS app), OpenClaw (not needed, security baggage), SpacetimeDB (new paradigm, real-time not core).

### Why iMessage (and not WhatsApp, Telegram, or SMS)
We want gudtrms itself to invite Person B, because people splitting up often aren't on speaking terms, so A shouldn't have to contact B. That rules out most channels within a 24-hour hackathon:

| Channel | Can gudtrms text B first? | Approvals needed | Problem |
|---|---|---|---|
| **iMessage (Photon)** | **Yes** | **None.** A line comes with the Spectrum plan | iPhone only |
| WhatsApp | Only with a Meta-approved template | Meta app setup + template approval (minutes to hours, not guaranteed) | Test number only reaches an allowlist of registered phones, so judges can't try it; 24-hour reply window |
| Telegram | **No.** Bots can't message anyone who hasn't opened the bot first | None | A has to forward a link to B, which is what we're trying to avoid |
| SMS (Twilio etc.) | Yes, technically | US carrier registration (A2P 10DLC or toll-free verification), usually days to weeks | Won't be approved in time; trial accounts only reach verified numbers; unencrypted, which is a bad look for a privacy product |

**Trade-off we're accepting:** Android users can't be invited or take part. Fine for the demo if every demo phone is an iPhone. Photon's marketing mentions SMS/RCS, so ask the booth whether an iMessage line falls back to SMS for Android numbers (see open questions). WhatsApp is the backup plan if we need Android.

### iMessage notes
- **Credentials:** Photon project ID + secret (cloud mode), in `.env`, never committed. Local mode reads the macOS Messages database directly with no credentials, which is an option for dev on a Mac.
- **Lines:** Free/Pro plans route each user through a number from a **shared pool**, so A and B may text different numbers. Fine for us, since everything is 1:1 DMs and the router keys on the user's handle, not our number. A dedicated number needs the Business plan.
- **Texting first:** `const dm = await im.space.create(await im.user("+15551111111")); await dm.send("...")`. This is how the invite to B is sent (section 5).
- **Limits:** 50 new conversations per line per day (the first message to someone the line has never texted), 5,000 messages per server per day. Plenty for a demo.
- **No 24-hour window, no templates.** But the invite rules in section 5 still apply. Nothing in iMessage stops us from texting anyone, so those rules are the only thing keeping gudtrms from being a way to get around a block.
- **Test with iPhones:** every demo phone (and any judge who tries it) must be on iMessage.

---

## 4. Core concept and privacy rules (DECIDED)

- Each person gets their **own advocate agent** that knows their private preferences and constraints.
- A **mediator** (code) generates proposals. Advocates can only **accept or reject**, and no reasons are shared with the other side.
- If no deal fits, each person's agent **privately** asks its own human to relax something. Ask both people at the same time so neither is singled out as the blocker.
- The output is a **written agreement** both people confirm.

### Privacy rules (non-negotiable)
1. A person's private data is only readable by **their own** intake agent, **their own** advocate, and the mediator code. **Only exception:** the localhost-only judge view (section 8), a demo tool that runs on fake data and is never deployed.
2. The only things that cross from one side to the other: the shared item list (names only), whether a proposal was accepted or rejected (no reasons), and the final agreement.
3. **Only the mediator generates proposals.** Advocates cannot propose, ask the other side questions, or send free text across.
4. **Round cap** on negotiation to prevent probing (proposed: 5 rounds).
5. **Every outbound message passes the leak filter.**
6. Don't log raw private values to the console during the demo.
7. Never explain which constraint drove an outcome.

---

## 5. User flow (PROPOSED)

All conversation happens in **1:1 DMs** with the gudtrms number. No group chat between the two people.

1. **Start:** Person A texts `start`. gudtrms replies with a short intro and asks for their ex's first name and phone number. A also gets a **case code** as a backup.
2. **Invite:** gudtrms texts B one fixed invite: `{name} started a gudtrms case to sort out your shared stuff privately. Reply JOIN to take part or STOP to never hear from us again.` A doesn't have to talk to B at all. Invite rules:
   - **One invite per case, no reminders, no follow-ups.** If B never replies, gudtrms never messages B again.
   - The invite text is fixed. A can't add free text, so it can't be used to send messages to B.
   - B replies `STOP` → that number goes on a permanent opt-out list and **no case from anyone** can invite it again. A is told only "they didn't join."
   - A is told "invite sent, waiting on them." A never learns whether B read it.
3. **Join:** B replies `JOIN` (or texts the case code if A forwarded it instead). Both are now linked to one case.
4. **Intake (private, in each person's own thread):**
   - Build the **shared item list**. Either person can add items. Item names are visible to both; values are not.
   - For each item: what's it worth to you, in dollars. The agent helps people who can't put a number on it ("would you rather have the couch or $200?").
   - **Hard constraints:** max buyout you can pay, move-out window, dealbreakers ("I have to keep the dog").
   - For each piece of info, the agent confirms **private vs. okay to share**. Default is private.
5. **Negotiation:** mediator proposes, advocates accept/reject, up to the round cap. No humans involved unless stuck.
6. **Stuck:** each person's agent privately asks them to relax something: "Nothing fits yet. Would you go up to $700? Totally fine to say no, nobody will know you were asked."
7. **Agreement:** both people get the same final text and reply `YES` to confirm. Once both confirm, the case closes.

**Example agreement**
```
gudtrms agreement · Case 4F7K

- Alex keeps the apartment and the lease. Sam moves out by Nov 30.
- Alex pays Sam $640.
- Sam keeps the couch and the TV.
- Biscuit lives with Alex. Sam has Biscuit every other weekend.

Reply YES to confirm.
```

---

## 6. Architecture (PROPOSED)

```
        iMessage via Photon Spectrum
   Person A's DM            Person B's DM
         |                        |
         v                        v
   +------------------------------------+
   | Router: handle -> participant/case |
   +------------------------------------+
         |
         +--> Intake agent (LLM, per person) -> structured private data -> Neon
         |
         +--> Mediator (deterministic code): generates proposals
         |        <-> Advocate A (sees only A's private data)
         |        <-> Advocate B (sees only B's private data)
         |
         +--> Leak filter (every outbound message)
         |
         +--> Agreement writer -> both DMs

   Judge view (localhost only, read-only from Neon, polls every ~1s):
   three lanes (Advocate A | what crosses | Advocate B) + X-ray toggle. See section 8.
```

**Router:** maps an incoming handle to a participant and case. Handles `start`, collecting the ex's number and sending the invite, `JOIN` / case-code joins, `STOP` opt-outs, and `YES` confirmations; routes everything else to that person's intake agent or relaxation prompt.

**Intake agent (LLM, one conversation per participant):** turns chat into structured data (items, dollar valuations, hard constraints, visibility flags). Writes only its own participant's rows. Never reads the other person's data.

**Mediator (deterministic code):** allocation uses **Knaster's procedure** (sealed bids with money):
- A values item *i* at `a_i`, B at `b_i` (dollars, private). Each item goes to whoever values it more.
- Fair shares: `F_A = sum(a_i) / 2`, `F_B = sum(b_i) / 2`.
- `W_A`, `W_B` = what each received, by their own valuations. Excess: `E_A = W_A - F_A`, `E_B = W_B - F_B`.
- Surplus `S = E_A + E_B` (always >= 0).
- **Transfer from A to B = `E_A - S/2`** (negative means B pays A).
- Result: A ends at `F_A + S/2`, B at `F_B + S/2`. For 2 people, nobody would want to swap.
- Check hard constraints on every proposal (buyout cap, must-keep items, move-out window). If the base proposal fails one, generate alternatives (reassign items, adjust the transfer) ranked by total value.
- Never sends free text across sides.

**Advocates (one per person):**
- See only their own person's private data.
- **Allowed moves:** `ACCEPT`, `REJECT` (no reason crosses over), and privately asking their own human to relax a constraint.
- v1 logic is **deterministic**: accept if all hard constraints pass and the proposal gives at least that person's fair share by their own valuations. The LLM only writes messages to its own person.
- For every decision, writes a one-line **inner monologue** to `advocate_notes` (e.g. "Gives me the dog, buyout is under my cap. ACCEPT"). Only the judge view reads it. It is never sent to anyone.

**Leak filter (every outbound message):**
1. Block any number that matches the *other* person's private valuations or constraints.
2. LLM yes/no check: does this reveal anything the other person marked private?
3. Log every block to `leak_events`.

**Pets:** v1 treats a pet as an indivisible item. v2 (stretch): options like "A keeps," "B keeps," "shared every other weekend," each valued by both people.

---

## 7. Data model in Neon (PROPOSED)

```sql
cases        (id uuid pk, code text unique, status text, created_at timestamptz)
             -- status: inviting | intake | negotiating | needs_relaxation | agreed | closed
participants (id uuid pk, case_id fk, handle text, role text, display_name text, intake_done bool,
              invite_sent_at timestamptz, joined_at timestamptz)
             -- role: 'A' | 'B'; handle = phone number (E.164) / iMessage ID
             -- B's row is created when A gives the number; joined_at stays null until B replies JOIN.
             -- invite_sent_at set once, never re-sent.
opt_outs     (handle text pk, created_at timestamptz)
             -- anyone who replied STOP. Checked before every invite, across all cases.
items        (id uuid pk, case_id fk, name text, kind text, added_by fk participants)
             -- kind: item | lease | pet | deposit | subscription; name is visible to both
valuations   (participant_id fk, item_id fk, value_cents int, visibility text default 'private',
              pk(participant_id, item_id))                                  -- PRIVATE
constraints  (id uuid pk, participant_id fk, kind text, value jsonb, visibility text default 'private')
             -- kind: max_buyout_cents | must_keep_item | move_out_window | other  -- PRIVATE
proposals    (id uuid pk, case_id fk, round int, allocation jsonb, transfer jsonb, status text, created_at)
             -- allocation: { item_id: participant_id }; transfer: { from, to, amount_cents }
             -- status: pending | accepted | rejected | superseded
decisions    (proposal_id fk, participant_id fk, decision text, created_at, pk(proposal_id, participant_id))
             -- decision: accept | reject. No reason column, on purpose.
agreements   (id uuid pk, case_id fk, proposal_id fk, text text, a_confirmed bool, b_confirmed bool, created_at)
leak_events  (id uuid pk, case_id fk, target_participant_id fk, reason text, created_at)
             -- never store the blocked content in plaintext
advocate_notes (id uuid pk, case_id fk, proposal_id fk, participant_id fk, note text, created_at)
             -- PRIVATE. Advocate's one-line reasoning per decision. Read ONLY by the judge view.
             -- Kept separate so `decisions` stays reason-free.
```

---

## 8. Features the demo depends on (PROPOSED)

These must exist for the demo:
- **Rogue mode** (flag on one advocate): it tries to send a free-text question across ("what's Alex's max buyout?"). The protocol rejects the message type and the leak filter logs it to `leak_events`.

### Judge view
A web page on the demo laptop that shows judges the advocates negotiating. The exes never see it.

**Layout: three lanes**
```
+------------------+------------------------+------------------+
| ALEX'S ADVOCATE  |     WHAT CROSSES       |  SAM'S ADVOCATE  |
| (private)        |     (the wire)         |  (private)       |
|                  |                        |                  |
| values: dog $900 | Round 2 proposal:      | values: dog $400 |
| max buyout: $800 | Alex: apt, dog         | must leave by    |
|                  | Sam: couch, TV         |   Nov 30         |
| "Gives me the    | Alex pays Sam $640     | "Under my move-  |
|  dog, buyout is  |                        |  out date, above |
|  under my cap."  | Alex: ACCEPT           |  my fair share." |
|  -> ACCEPT       | Sam:  ACCEPT           |  -> ACCEPT       |
+------------------+------------------------+------------------+
```
- **Side lanes:** that advocate's private valuations and constraints, plus its `advocate_notes` line for each decision.
- **Middle lane:** only what actually crosses: proposals and accept/reject, no reasons. Also the final agreement.

**Must-haves**
- **X-ray toggle.** Side lanes start **blurred** so judges first see only the middle ("this is all that ever crosses"). Flipping the toggle unblurs them ("here's what each agent knows, and none of it crossed").
- **Demo pacing flag.** The real negotiation takes milliseconds. With the flag on, wait ~1.5s between moves so judges can follow.
- **Animated flow:** proposal card appears in the middle, each side lights up green (accept) or red (reject), round counter ticks, final agreement pops.
- **Math panel:** each person's fair share, the surplus, and the transfer, so judges see *why* the buyout is $640.
- **Rogue mode display:** the blocked free-text message shows in red in the middle lane ("BLOCKED: free text not allowed"), plus the `leak_events` entry.

**Rules**
- Read-only. Polls Neon every ~1s.
- **localhost only.** Never deploy it publicly. It reads private data, which is fine only because the demo uses fake data.

---

## 9. Build plan (PROPOSED, hacking started 12:00 PM Sat)

| Hours | Goal |
|---|---|
| 0 to 2 | Photon hello world (terminal provider), Neon schema, router, case codes |
| 2 to 6 | Intake agent: items, valuations, constraints, private/share confirmation |
| 6 to 10 | Mediator + advocates, unit-tested with fake data |
| 10 to 14 | End-to-end on iMessage with two real iPhones |
| 14 to 18 | Leak filter, round cap, rogue mode, relaxation flow |
| 18 to 21 | Judge view |
| 21 to 24 | Polish, backup video, Devpost, pitch rehearsal |

---

## 10. Open questions

- [ ] Which LLM provider and model?
- [ ] Photon setup: project created at app.photon.codes, iMessage turned on, project ID + secret in `.env`? Are all demo phones iPhones?
- [ ] Photon booth: if our iMessage line texts an Android number, does it fall back to SMS/RCS, and does that need carrier (10DLC) registration? If yes and no, we get Android for free.
- [ ] Photon booth: on the shared-pool line, does `im.space.create` to a brand-new number work on the free plan?
- [ ] Photon and Neon prize requirements (MHacks prizes page, behind login)
- [ ] Pets: indivisible in v1, or build shared-custody options?
- [ ] Does the item list need both people to approve it before valuations start?

## 11. Team and ownership

| Area | Owner | Status |
|---|---|---|
| Messaging + router (Photon) | TBD | not started |
| Intake agent | TBD | not started |
| Mediator + advocates | TBD | not started |
| Privacy layer (leak filter, rogue mode) | TBD | not started |
| Neon schema + DB access | TBD | not started |
| Judge view | TBD | not started |
| Pitch + Devpost + video | TBD | not started |
