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
1. A person's private data is only readable by **their own** intake agent, **their own** advocate, and the mediator code. The mediator only gets what it needs to build a deal (valuations, move-out windows, deposit contributions). **Payment caps and dealbreakers stay with the advocate only.** **Only exception:** the localhost-only judge view (section 8), a demo tool that runs on fake data and is never deployed.
2. The only things that cross from one side to the other: the shared item list (names only), each person's deposit contribution (a fact both confirm, not a preference), the mediator's proposals, whether each proposal was accepted or rejected (no reasons), and the final agreement.
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
4. **Intake (private, in each person's own thread):** the agent says up front that **everything you tell it stays private**. There's no "okay to share" option. The only exception is your deposit contribution (below), which is a fact, not a preference.
   - Build the **shared item list**. Either person can add items: stuff (couch, TV), the lease, pets, subscriptions. Item names are visible to both; values are not.
   - **Items:** what's it worth to you to keep it, in dollars. The agent helps people who can't put a number on it ("would you rather have the couch or $200?").
   - **The lease:** what's it worth to you to stay, compared with both of you moving out? Positive means you'd like to stay. Zero or negative means you'd rather both leave (the rent is too high, or you want a fresh start). If neither person puts a positive number, you **both move out**.
   - **Lease-break fee** (only asked if the lease runs past your move-out window): the fee amount is a fact. It's shown to both people to confirm, like the deposit. Then the agent asks: "how much would someone have to pay you for you to cover the whole fee?" That's your (negative) value for taking it on, and it defaults to the fee amount.
   - **Pets:** three numbers. What's it worth to you if Biscuit (1) lives with you full-time, (2) lives with you and your ex has Biscuit every other weekend, (3) lives with your ex and you have Biscuit every other weekend.
   - **Subscriptions** (Netflix, Spotify, internet): what's it worth to you to keep the account? Whoever keeps it takes over billing from the move-out date. The value can be negative if it's a burden ("I'd pay $50 to not be stuck with the internet contract"). If nobody wants it, it gets cancelled.
   - **Security deposit:** how much of it did you pay? Each person's contribution is shown to the other to confirm. If the numbers don't add up, both agents ask their person to double-check.
   - **Move-out window:** the range of dates that works for you for whoever moves out to be gone (or for both of you to be gone, if you both leave).
   - **Hard constraints:** the most you could pay your ex in total (buyout plus deposit payback), and dealbreakers ("Biscuit has to live with me").
5. **Negotiation:** mediator proposes, advocates accept/reject, up to the round cap. No humans involved unless stuck.
6. **Stuck:** each person's agent privately asks them to relax something: "Nothing fits yet. Would you go up to $700? Totally fine to say no, nobody will know you were asked."
7. **Agreement:** both people get the same final text and reply `YES` to confirm. Once both confirm, the case closes. **`YES` only counts as a confirmation after the agreement has been sent to that person.** Any other "yes" (answering the agent during intake or relaxation) is just an answer to the agent's question.

**Example agreement** (matches the demo scenario in section 8)
```
gudtrms agreement · Case 4F7K

- Alex keeps the apartment and the lease. Sam moves out by Nov 30.
- Alex pays Sam $640 as a buyout.
- The deposit stays with the landlord under Alex's lease, so Alex pays Sam back Sam's $750 share.
- Total: Alex pays Sam $1,390.
- Sam keeps the couch and the TV.
- Biscuit lives with Alex. Sam has Biscuit every other weekend.
- Spotify gets cancelled.

Reply YES to confirm.
```

**Example agreement when both move out**
```
gudtrms agreement · Case 9QJ2

- You both move out by Dec 15.
- Riley pays the landlord the $600 lease-break fee.
- Jordan pays Riley $220 as a buyout.
- Security deposit: when the landlord returns it, Jordan gets 60% and Riley gets 40%
  (any deductions are shared the same way). Whoever receives it sends the other their share.
- Jordan keeps the couch. Riley keeps the TV and the bookshelf.

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

**Router:** maps an incoming handle to a participant and case, then routes by **keyword + case state**. A keyword only counts in the right state; otherwise the message goes to that person's agent as normal chat.

| Keyword | Only counts when | Otherwise |
|---|---|---|
| `start` | sender has no open case | goes to their agent |
| `JOIN` / case code | sender was invited (or has the code) and hasn't joined yet | goes to their agent |
| `STOP` | **always** (safety). Removes them from any case and adds them to `opt_outs`. The other person is told only that the case ended | — |
| `YES` | case is `awaiting_confirmation` **and** the agreement has been sent to this person | it's just an answer to whatever their agent asked |

Everything else goes to that person's intake agent or relaxation prompt.

**Intake agent (LLM, one conversation per participant):** turns chat into structured data (items, valuations per outcome, deposit contribution, move-out window, hard constraints). Writes only its own participant's rows. Never reads the other person's data.

**Mediator (deterministic code):** sees valuations, move-out windows, and deposit contributions. It does **not** see payment caps or dealbreakers; those live only in each advocate. That's why a proposal can be rejected, and why the advocates do real work.

*Outcomes.* Every item has a set of outcomes, and each person puts a dollar value on each outcome:
- Stuff and subscriptions: **A keeps** or **B keeps**. For a subscription, if both values are <= 0, it's **cancelled**.
- The lease: **A stays**, **B stays**, or **both move out**. "Both move out" is worth $0 to each person (it's the baseline the stay values are measured against), so with no fee it wins whenever neither person values staying above $0.
- Lease-break fee: an item that **only exists if both move out**, with outcomes **A pays** or **B pays**. Like any other item, it goes to whoever values it highest (i.e. minds paying it least), and the buyout compensates them. Because its value is negative, it drags down the "both move out" option. The mediator picks both moving out only if it's still the best total even after the fee. So "both move out with fee" competes against "A stays" and "B stays" as a lease outcome, valued at the best fee assignment.
- Pets: **A full-time**, **A + B every other weekend**, **B + A every other weekend**, **B full-time**. The person with every-other-weekend gets their "visits" value, and the full-time person gets nothing from the other side.

*Allocation* (Knaster's procedure, generalized to outcomes):
- For each item, pick the outcome with the **highest total value** (A's value + B's value). For a plain item, that's just "whoever values it more."
- Fair shares: `F_A = (sum of A's keep / full-time values) / 2`, same for `F_B`.
- `W_A`, `W_B` = what each received, by their own valuations. Excess: `E_A = W_A - F_A`, `E_B = W_B - F_B`.
- Surplus `S = E_A + E_B` (always >= 0 for the best allocation).
- **Buyout from A to B = `(E_A - E_B) / 2`** (same as `E_A - S/2`; negative means B pays A). Both end up exactly `S/2` above their fair share.

*Deposit.* It's a separate line in the agreement and **not** part of the fair-share math, since it's just returning people's own money.
- **One person stays:** the deposit stays with the landlord under the lease, so the person staying pays the other back their contribution now. This counts toward the payer's cap.
- **Both move out:** the landlord returns the deposit. The refund is split **in proportion to what each person paid**, and any deductions are shared the same way. Whoever receives the refund sends the other their share. Nobody pays anything up front, so it doesn't count toward anyone's cap.

*Move-out date.* The **latest date inside both windows**: it gives whoever is leaving the most time, and if both are leaving it's the date both are out by. No overlap means nothing can work, so go straight to relaxation.

*Rounds.* The mediator ranks candidate allocations by total value (the best one first, then single-item changes, and so on) and proposes them in order, recomputing the buyout for each. A rejection moves to the next candidate. After the round cap, the case goes to `needs_relaxation`. Never sends free text across sides.

**Advocates (one per person):**
- See only their own person's private data.
- **Allowed moves:** `ACCEPT`, `REJECT` (no reason crosses over), and privately asking their own human to relax a constraint.
- v1 logic is **deterministic**. Accept only if all of these hold:
  - total payment (buyout + deposit payback, if any) is under the person's cap
  - every dealbreaker is met (for a pet, "lives with me" means full-time or primary with ex on weekends)
  - the move-out date is inside the person's window
  - the proposal gives at least their fair share by their own valuations (deposit excluded)
- The LLM only writes messages to its own person.
- **Relaxation:** when stuck, the advocate looks at the rejected proposals and asks its person for the smallest change that would have made one pass (e.g. "would you go up to $1,615?").
- For every decision, writes a one-line **inner monologue** to `advocate_notes` (e.g. "Total $1,615 is over my $1,600 cap. REJECT"). Only the judge view reads it. It is never sent to anyone.

**Leak filter (every outbound message):**
There are two kinds of outbound messages. **Proposals and the agreement** are filled into fixed templates from structured data, with no LLM text. **Agent messages** are LLM text sent to the agent's own person.
1. **Number/date match.** Block any dollar amount or date that matches one of the *other* person's private values (valuations, cap, window).
   - **Exception:** numbers and dates that appear in a proposal or agreement from this case. Those already crossed the wire by design. Without this exception, the filter would block the agreement itself, because the buyout and the move-out date come straight from both people's private numbers.
   - Match dollar amounts (normalize `$1,500`, `1500 dollars`, `1.5k`) and dates only, not bare small numbers like "round 2."
   - A person's **own** numbers are always fine to say back to them.
2. **LLM yes/no check:** does this reveal anything from the other person's private data?
3. Log every block to `leak_events` (never store the blocked content).

Known, accepted leak: the final buyout and move-out date are functions of both people's private numbers (the date is always the edge of someone's window). That's unavoidable in any agreement. We never say which constraint drove the result (privacy rule 7).

---

## 7. Data model in Neon (PROPOSED)

```sql
cases        (id uuid pk, code text unique, status text, created_at timestamptz)
             -- status: inviting | intake | negotiating | needs_relaxation | awaiting_confirmation | closed
             -- awaiting_confirmation = agreement sent, waiting on both YES replies
participants (id uuid pk, case_id fk, handle text, role text, display_name text, intake_done bool,
              invite_sent_at timestamptz, joined_at timestamptz)
             -- role: 'A' | 'B'; handle = phone number (E.164) / iMessage ID
             -- B's row is created when A gives the number; joined_at stays null until B replies JOIN.
             -- invite_sent_at set once, never re-sent.
opt_outs     (handle text pk, created_at timestamptz)
             -- anyone who replied STOP. Checked before every invite, across all cases.
items        (id uuid pk, case_id fk, name text, kind text, added_by fk participants, amount_cents int)
             -- kind: item | lease | pet | subscription | lease_break_fee; name is visible to both
             -- amount_cents: only for lease_break_fee (the landlord's fee, a fact both confirm; NOT private)
valuations   (participant_id fk, item_id fk, outcome text, value_cents int,
              pk(participant_id, item_id, outcome))                         -- PRIVATE
             -- outcome: 'keep' for item | lease | subscription (lease and subscription may be negative;
             --          for the lease, 'keep' = value of staying vs. both moving out)
             --          'full' | 'primary' | 'visits' for pets
             --          'pay' for lease_break_fee (negative: what taking on the whole fee costs you)
deposit_contributions (case_id fk, participant_id fk, amount_cents int, pk(case_id, participant_id))
             -- NOT private: shown to the other person to confirm.
constraints  (id uuid pk, participant_id fk, kind text, value jsonb)        -- PRIVATE, advocate only
             -- kind: max_payment_cents | must_keep_item | move_out_window | other
             -- move_out_window is also read by the mediator; the rest are not.
proposals    (id uuid pk, case_id fk, round int, allocation jsonb, transfer jsonb, move_out_date date,
              status text, created_at)
             -- allocation: { item_id: { to: participant_id | null, weekends: participant_id | null } }
             --   to = null means cancelled (subscription) or both move out (lease);
             --   for lease_break_fee, to = who pays the landlord (only present when both move out);
             --   weekends set only for shared pets
             -- transfer: { from, to, buyout_cents, deposit_cents, total_cents }
             --   deposit_cents = 0 when both move out; the refund split goes in deposit_split
             -- deposit_split (in transfer): { participant_id: share_pct } when both move out, else null
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
- **A conflict.** The demo must show at least one `REJECT` before the deal lands, so judges see the advocates actually protect their person. See the scenario below.
- **Rogue mode** (flag on one advocate): it tries to send a free-text question across ("what's Alex's max payment?"). The protocol rejects the message type and the leak filter logs it to `leak_events`.

### Demo scenario (fake data)
Use this seed data so the demo hits a reject in round 1 and agrees in round 2. The math is checked; if you change a number, recheck the rounds.

| | Alex | Sam |
|---|---|---|
| Apartment (lease) | $1,500 | $1,410 |
| Biscuit: full-time with me | $900 | $400 |
| Biscuit: with me, ex every other weekend | $800 | $350 |
| Biscuit: with ex, me every other weekend | $300 | $250 |
| Couch | $200 | $300 |
| TV | $250 | $200 |
| Spotify | $0 | $0 |
| Deposit paid | $750 | $750 |
| Move-out window | Nov 15 to Dec 31 | Nov 1 to Nov 30 |
| Max total payment *(advocate only)* | $1,600 | none |
| Dealbreaker *(advocate only)* | Biscuit lives with me | none |

Fair shares: `F_A = (1500+900+200+250+0)/2 = $1,425`, `F_B = (1410+400+300+200+0)/2 = $1,155`. Biscuit goes to "Alex + Sam every other weekend" (total $1,050, the best of the four). Spotify is cancelled. Move-out date is Nov 30.

| Round | Allocation | Buyout | + Deposit | Total | Alex | Sam |
|---|---|---|---|---|---|---|
| 1 (best total value) | Alex: apt, Biscuit, **TV** · Sam: couch, Biscuit weekends | $865 | $750 | $1,615 | **REJECT** (over $1,600 cap) | ACCEPT |
| 2 (next best: TV moves to Sam, -$50 total) | Alex: apt, Biscuit · Sam: couch, **TV**, Biscuit weekends | $640 | $750 | $1,390 | ACCEPT | ACCEPT |

Round 2 check: Alex ends at $2,300 - $640 = $1,660 (fair share $1,425), and Sam at $750 + $640 = $1,390 (fair share $1,155). Both are exactly $235 above fair share, so the surplus `S = $470` is split evenly.

### Judge view
A web page on the demo laptop that shows judges the advocates negotiating. The exes never see it.

**Layout: three lanes**
```
+------------------+------------------------+------------------+
| ALEX'S ADVOCATE  |     WHAT CROSSES       |  SAM'S ADVOCATE  |
| (private)        |     (the wire)         |  (private)       |
|                  |                        |                  |
| values: dog $900 | Round 2 proposal:      | values: dog $400 |
| max pay: $1,600  | Alex: apt, Biscuit     | move out by      |
|                  | Sam: couch, TV,        |   Nov 30         |
|                  |   Biscuit alt. wkends  |                  |
| "Total $1,390 is | Alex pays Sam $1,390   | "Out by Nov 30,  |
|  under my cap."  |                        |  above my fair   |
|                  | Alex: ACCEPT           |  share."         |
|  -> ACCEPT       | Sam:  ACCEPT           |  -> ACCEPT       |
+------------------+------------------------+------------------+
```
- **Side lanes:** that advocate's private valuations and constraints, plus its `advocate_notes` line for each decision.
- **Middle lane:** only what actually crosses: proposals and accept/reject, no reasons. Also the final agreement.

**Must-haves**
- **X-ray toggle.** Side lanes start **blurred** so judges first see only the middle ("this is all that ever crosses"). Flipping the toggle unblurs them ("here's what each agent knows, and none of it crossed").
- **Demo pacing flag.** The real negotiation takes milliseconds. With the flag on, wait ~1.5s between moves so judges can follow.
- **Animated flow:** proposal card appears in the middle, each side lights up green (accept) or red (reject), round counter ticks, final agreement pops.
- **Math panel:** each person's fair share, the surplus, the buyout, and the deposit payback as a separate line, so judges see *why* the buyout is $640.
- **Rogue mode display:** the blocked free-text message shows in red in the middle lane ("BLOCKED: free text not allowed"), plus the `leak_events` entry.

**Rules**
- Read-only. Polls Neon every ~1s.
- **localhost only.** Never deploy it publicly. It reads private data, which is fine only because the demo uses fake data.

---

## 9. Build plan (PROPOSED, hacking started 12:00 PM Sat)

| Hours | Goal |
|---|---|
| 0 to 2 | Photon hello world (terminal provider), Neon schema, router, case codes |
| 2 to 6 | Intake agent: items, pet options, subscriptions, deposit, move-out window, constraints |
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
- [ ] Does the item list need both people to approve it before valuations start?
- [ ] What happens if someone replies `NO` (or anything other than `YES`) to the agreement? Back to relaxation, or the case ends?

## 11. Team and ownership

Split: **Pranav = conversation side** (everything a human sees over iMessage). **Shruti = negotiation side** (deal engine + the judge view that proves nothing leaked). Diagram, contract, and timeline: https://claude.ai/artifact/MRD8VTJcSoxGVtZPUQsLLP

| Area | Owner | Folder | Status |
|---|---|---|---|
| Photon setup + messaging adapter (incl. invite to a new number) | Pranav | `src/messaging/` | not started |
| Router (keyword × case state) | Pranav | `src/router/` | not started |
| Intake agent (LLM) | Pranav | `src/intake/` | not started |
| Agreement text, YES confirmation, relaxation prompts | Pranav | `src/conversation/` | not started |
| Leak filter (wraps every outbound send) | Pranav | `src/privacy/` | not started |
| Neon schema, DB client, demo seed | Shruti | `db/`, `src/db/` | not started |
| Mediator | Shruti | `src/engine/` | not started |
| Advocates, `negotiate()`, rogue mode | Shruti | `src/engine/` | not started |
| Judge view | Shruti | `judge/` | not started |
| Neon RLS + demo-seed branch, Notability screenshots | Shruti | | not started |
| .Tech domain | Pranav | | not started |
| Pitch + Devpost + backup video | Both | | not started |

**Contract between the halves** (`src/shared/contract.ts`): the Neon tables in section 7, plus
- `negotiate(caseId) → { status: 'agreed', proposalId } | { status: 'needs_relaxation', asks }`. Shruti implements it. Pranav calls it once both people finish intake, and again after someone relaxes a constraint.
- `sendTo(participantId, text)`. Pranav implements it, and it runs the leak filter first. Every outbound message goes through it.

**Sync points:** ~11 PM Sat, a seeded case runs through `negotiate()` and the agreement prints via the terminal provider. ~3 AM Sun, a full run on two iPhones with the judge view open.
