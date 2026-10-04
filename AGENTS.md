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
| Agents | **Multi-agent, no agent framework.** Each person gets two LLM agents of their own (a chat agent and an advocate agent), each in its own LLM context built only from that person's data. The mediator stays deterministic code. All of it is plain modules in our backend calling `src/llm/` | Real agents doing the talking and judging, while the parts that must be fair and provable (proposals, hard limits, the wire) stay code. See section 6 |
| Payments | **None** | Not core |
| LLM | **Claude** via the Anthropic SDK (default `claude-sonnet-5-5`, low effort), behind a small provider interface in `src/llm/` | Grok or Gemini can be added later as one file in `src/llm/` plus `LLM_PROVIDER` in `.env`; nothing else changes |

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
- **Texting first:** `const dm = await im.space.create(await im.user("+15551111111")); await dm.send("...")`. This is how the invite to B is sent (section 5). **On the Free/Pro shared pool this only works for numbers added as Photon project users that have already texted their line once** (section 10). If the invite fails, A gets the case code to pass on instead.
- **Limits:** 50 new conversations per line per day (the first message to someone the line has never texted), 5,000 messages per server per day. Plenty for a demo.
- **No 24-hour window, no templates.** But the invite rules in section 5 still apply. Nothing in iMessage stops us from texting anyone, so those rules are the only thing keeping gudtrms from being a way to get around a block.
- **Test with iPhones:** every demo phone (and any judge who tries it) must be on iMessage.

---

## 4. Core concept and privacy rules (DECIDED)

- Each person gets their **own agents**: a chat agent they text with, and an advocate agent that negotiates for them. Both know only that person's private preferences and constraints.
- A **mediator** (code) generates proposals. Advocates can only **accept or reject**, and no reasons are shared with the other side.
- If no deal fits, each person's agent **privately** asks its own human to relax something. Ask both people at the same time so neither is singled out as the blocker.
- The output is a **written agreement** both people confirm.

### Privacy rules (non-negotiable)
1. A person's private data is only readable by **their own** chat agent, **their own** advocate, and the mediator code. Every LLM call is built from one person's rows only; no prompt ever contains both people's private data. The mediator only gets what it needs to build a deal (valuations, move-out windows, deposit contributions). **Payment caps and dealbreakers stay with the advocate only.** **Only exception:** the localhost-only judge view (section 8), a demo tool that runs on fake data and is never deployed.
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
   - **Pets:** four numbers. What's it worth to you if Biscuit (1) lives with you full-time, (2) lives with you and your ex has Biscuit every other weekend, (3) splits time 50/50 (one week with you, one week with your ex), (4) lives with your ex and you have Biscuit every other weekend. If someone describes another arrangement ("two weeks on, two off", "70/30"), the chat agent maps it to the closest of these. The mediator only knows these options.
   - **Subscriptions** (Netflix, Spotify, internet): what's it worth to you to keep the account? Whoever keeps it takes over billing from the move-out date. The value can be negative if it's a burden ("I'd pay $50 to not be stuck with the internet contract"). If nobody wants it, it gets cancelled.
   - **Security deposit:** how much of it did you pay? Each person's contribution is shown to the other to confirm. If the numbers don't add up, both agents ask their person to double-check.
   - **Move-out window:** the range of dates that works for you for whoever moves out to be gone (or for both of you to be gone, if you both leave).
   - **Hard constraints:** the most you could pay your ex in total (buyout plus deposit payback), and dealbreakers ("Biscuit has to live with me").
5. **Negotiation:** mediator proposes, advocates accept/reject, up to the round cap. No humans involved unless stuck.
6. **Stuck:** each person's agent privately asks them to relax something: "Nothing fits yet. Would you go up to $700? Totally fine to say no, nobody will know you were asked."
7. **Agreement:** both people get the same final text and reply `YES` to confirm. Once both confirm, the case closes. **`YES` only counts as a confirmation after the agreement has been sent to that person.** Any other "yes" (answering the agent during intake or relaxation) is just an answer to the agent's question. A bare `NO` to the agreement sends the case back to the table (section 10): that person is asked privately what doesn't work, and the other is told only that it wasn't confirmed yet.

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

A 50/50 pet gets this line in the agreement: `- Biscuit splits time 50/50: one week with Jordan, then one week with Riley.`

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
         |                        |
         v                        v
   +---------------+        +---------------+
   | A's chat      |        | B's chat      |   LLM. Intake, relaxation replies,
   | agent         |        | agent         |   anything that isn't a keyword.
   +---------------+        +---------------+   Tools write only its own person's rows.
         |                        |
         v (A's rows only)        v (B's rows only)
   +---------------+        +---------------+
   | A's advocate  |        | B's advocate  |   LLM. Judges each proposal for its person.
   | agent         |        | agent         |   Hard checks are code (a veto it can't override).
   +---------------+        +---------------+
         ^   |                    ^   |
         |   | ACCEPT/REJECT      |   | ACCEPT/REJECT
         |   v                    |   v
   +-------------------------------------------+
   | Protocol gate (code): only ACCEPT/REJECT  |   the "wire". Anything else is blocked
   | crosses. Free text is blocked + logged    |   and logged to leak_events
   +-------------------------------------------+
         ^                        ^
         | proposals              | proposals
   +-------------------------------------------+
   | Mediator (deterministic code)             |   sees valuations, windows, deposits.
   +-------------------------------------------+   Never caps or dealbreakers.
         |
         +--> Agreement writer (fixed template) -> both DMs
         +--> Leak filter (every outbound message, incl. every chat-agent reply)

   Judge view (localhost only, read-only from Neon, polls every ~1s):
   three lanes (Advocate A | what crosses | Advocate B) + X-ray toggle. See section 8.
```

**Agents at a glance.** Six agents per case (two per person, plus the mediator and the leak checker). Every LLM agent runs in its own context:

| Agent | One per | Kind | Talks to | Can do | Owner |
|---|---|---|---|---|---|
| Chat agent | person | LLM | its own person only | record items, values, deposit, window, cap, dealbreakers; update a constraint after a relaxation ask; answer questions | Pranav (`src/intake/`) |
| Advocate agent | person | LLM, with code checks as a veto | nobody directly. It sends ACCEPT/REJECT across the wire, and a `RelaxAsk` to its own person's chat agent | accept, reject, write its inner monologue to `advocate_notes` | Shruti (`src/engine/`) |
| Mediator | case | deterministic code | both advocates, through the wire | propose deals in ranked order | Shruti (`src/engine/`) |
| Leak checker | case | LLM yes/no | nobody (checks outbound text) | block a message | Pranav (`src/privacy/`) |

What crosses between agents:
- **Same person, chat agent → advocate:** Neon rows (that person's valuations and constraints). The advocate never reads the chat transcript.
- **Same person, advocate → chat agent:** a structured `RelaxAsk` (e.g. `{ kind: 'max_payment', suggestedCents }`). The chat agent turns it into a message and handles the reply.
- **Across people:** only through the protocol gate, and only ACCEPT/REJECT. The chat agents never talk to each other or to the other person's advocate.

Why the mediator stays code: proposals must be fair, explainable on the math panel, and reproducible, and the section 8 demo depends on the exact round order. An LLM mediator would also need to see both people's data in one context, which rule 1 forbids.

**Router:** maps an incoming handle to a participant and case, then routes by **keyword + case state**. A keyword only counts in the right state; otherwise the message goes to that person's agent as normal chat.

| Keyword | Only counts when | Otherwise |
|---|---|---|
| `start` | sender has no open case | goes to their agent |
| `JOIN` / case code | sender was invited (or has the code) and hasn't joined yet | goes to their agent |
| `STOP` | **always** (safety). Removes them from any case and adds them to `opt_outs`. The other person is told only that the case ended | — |
| `YES` | case is `awaiting_confirmation` **and** the agreement has been sent to this person | it's just an answer to whatever their agent asked |
| `NO` | same as `YES` | it's just an answer to whatever their agent asked |

Everything else goes to that person's chat agent.

**Chat agent (LLM, one per participant):** the only agent a person talks to. Uses `llm().chat()` with tools (`src/llm/`).
- **Intake:** turns chat into structured data (items, valuations per outcome, deposit contribution, move-out window, hard constraints) through tool calls. Writes only its own participant's rows. Never reads the other person's data. Sets `intake_done`, then calls `onIntakeDone(caseId)`.
- **Soft preferences:** anything that matters to the person but isn't a number or a dealbreaker ("I don't want to do handoffs with them") is saved as a `constraints` row of kind `other` with a short text, so their advocate can weigh it.
- **Relaxation:** sends the advocate's `RelaxAsk` as a message, handles the reply as a conversation, and if the person agrees, **updates** the existing constraint row through a tool, then calls `runNegotiation(caseId)` again.
- Its system prompt is built from its own person's rows plus the shared item list. State lives in Neon, not in the LLM.

**Mediator (deterministic code):** sees valuations, move-out windows, and deposit contributions. It does **not** see payment caps or dealbreakers; those live only in each advocate. That's why a proposal can be rejected, and why the advocates do real work.

*Outcomes.* Every item has a set of outcomes, and each person puts a dollar value on each outcome:
- Stuff and subscriptions: **A keeps** or **B keeps**. For a subscription, if both values are <= 0, it's **cancelled**.
- The lease: **A stays**, **B stays**, or **both move out**. "Both move out" is worth $0 to each person (it's the baseline the stay values are measured against), so with no fee it wins whenever neither person values staying above $0.
- Lease-break fee: an item that **only exists if both move out**, with outcomes **A pays** or **B pays**. Like any other item, it goes to whoever values it highest (i.e. minds paying it least), and the buyout compensates them. Because its value is negative, it drags down the "both move out" option. The mediator picks both moving out only if it's still the best total even after the fee. So "both move out with fee" competes against "A stays" and "B stays" as a lease outcome, valued at the best fee assignment.
- Pets: **A full-time**, **A + B every other weekend**, **50/50 (week on, week off)**, **B + A every other weekend**, **B full-time**. The person with every-other-weekend gets their "visits" value, the full-time person gets nothing from the other side, and with 50/50 each person gets their own "split" value.

*Allocation* (Knaster's procedure, generalized to outcomes):
- For each item, pick the outcome with the **highest total value** (A's value + B's value). For a plain item, that's just "whoever values it more."
- Fair shares: `F_A = (sum of A's keep / full-time values) / 2`, same for `F_B`. For a pet, use A's **highest** pet value. That's normally full-time, but someone may value 50/50 above full-time (they want shared care, not sole care).
- `W_A`, `W_B` = what each received, by their own valuations. Excess: `E_A = W_A - F_A`, `E_B = W_B - F_B`.
- Surplus `S = E_A + E_B` (always >= 0 for the best allocation).
- **Buyout from A to B = `(E_A - E_B) / 2`** (same as `E_A - S/2`; negative means B pays A). Both end up exactly `S/2` above their fair share.

*Deposit.* It's a separate line in the agreement and **not** part of the fair-share math, since it's just returning people's own money.
- **One person stays:** the deposit stays with the landlord under the lease, so the person staying pays the other back their contribution now. This counts toward the payer's cap.
- **Both move out:** the landlord returns the deposit. The refund is split **in proportion to what each person paid**, and any deductions are shared the same way. Whoever receives the refund sends the other their share. Nobody pays anything up front, so it doesn't count toward anyone's cap.

*Move-out date.* The **latest date inside both windows**: it gives whoever is leaving the most time, and if both are leaving it's the date both are out by. No overlap means nothing can work, so go straight to relaxation.

*Rounds.* The mediator ranks candidate allocations by total value (the best one first, then single-item changes, and so on) and proposes them in order, recomputing the buyout for each. A rejection moves to the next candidate. After the round cap, the case goes to `needs_relaxation`. Never sends free text across sides.

**Advocate agents (LLM, one per person):**
- See only their own person's private data: valuations, constraints (including `other` soft preferences), and the shared item list. Never the chat transcript, never the other side's data (`assertOwnDataOnly` throws).
- **Allowed moves:** `ACCEPT`, `REJECT` (no reason crosses over), and handing its own chat agent a `RelaxAsk`.
- **How it decides each proposal** (one LLM call per proposal, effort low, both advocates in parallel; ~2s a round). Code: `decideAsAgent()` in `src/engine/advocateAgent.ts`.
  1. Its prompt has the proposal from its person's side, its own person's values, limits and soft preferences, and the results of the hard checks. Tools: `accept(note)`, `reject(note, soft_preference)`, and `send_to_other_side(text)`.
  2. The hard checks (`decide()` in `src/engine/advocate.ts`) run in code before the call, and their results are in the prompt. (One call instead of a `check_proposal` tool round trip: our LLM layer is stateless, and it halves the wait.) They are a **hard veto**: an `accept` is overruled unless all of these hold:
     - total payment (buyout + deposit payback, if any) is under the person's cap
     - every dealbreaker is met (for a pet, "lives with me" means full-time or primary with ex on weekends; 50/50 does **not** count)
     - the move-out date is inside the person's window
     - the proposal gives at least their fair share by their own valuations (deposit excluded)
  3. If every check passes, the agent may still `reject`, but only by naming one of its person's `other` soft preferences that the proposal goes against. Otherwise it accepts. This is where the LLM adds judgment the code can't.
  4. It writes its one-line **inner monologue** to `advocate_notes` in its own words (e.g. "$1,615 is $15 over Alex's cap. Can't take it. REJECT"). Only the judge view reads it. It is never sent to anyone.
  5. `send_to_other_side` exists on purpose: everything the agent sends goes through the protocol gate, which lets only ACCEPT/REJECT through. Free text is blocked and logged (rogue mode, section 8).
- **Fallback:** if the LLM call fails, times out (`ADVOCATE_TIMEOUT_MS`, default 10s), refuses, or doesn't call exactly one of accept / reject, the advocate uses the `decide()` result and its note. A negotiation never stalls on the LLM. A reject with every check passed and no valid soft-preference number is also overruled (to accept).
- `npm run advocate:check` runs both agents on the section 8 rounds (no database) and prints each decision, note, and whether the LLM, the veto, or the fallback decided. Run it after any prompt change.
- **Relaxation:** when stuck, `relaxAsk()` (code) finds the smallest change that would have made a rejected proposal pass (e.g. "would you go up to $1,615?"), and the advocate hands it to its own chat agent. The ask is computed by code so it never reveals the other side's numbers.
- `ADVOCATE_MODE=rules` turns the LLM off and uses `decide()` alone (same as v1), for tests and as a demo safety switch.

**Leak filter (every outbound message):**
There are two kinds of outbound messages. **Proposals and the agreement** are filled into fixed templates from structured data, with no LLM text. **Agent messages** are LLM text sent to the agent's own person.
1. **Number/date match.** Block any dollar amount or date that matches one of the *other* person's private values (valuations, cap, window).
   - **Exception:** numbers and dates that appear in a proposal or agreement from this case. Those already crossed the wire by design. Without this exception, the filter would block the agreement itself, because the buyout and the move-out date come straight from both people's private numbers.
   - Match dollar amounts (normalize `$1,500`, `1500 dollars`, `1.5k`) and dates only, not bare small numbers like "round 2."
   - A person's **own** numbers are always fine to say back to them.
2. **LLM yes/no check** (chat-agent replies only): does the text reveal or guess anything about the other person's private data? The checker gets the message, the recipient's own answers, shared facts and the agreement, never the other person's data (rule 1). It reasons in a sentence, then gives a verdict; unclear blocks. A blocked reply is rewritten once without specifics, then replaced with a safe line. Details: `src/privacy/README.md`.
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
             --          'full' | 'primary' | 'split' | 'visits' for pets (split = 50/50, week on / week off)
             --          'pay' for lease_break_fee (negative: what taking on the whole fee costs you)
deposit_contributions (case_id fk, participant_id fk, amount_cents int, pk(case_id, participant_id))
             -- NOT private: shown to the other person to confirm.
constraints  (id uuid pk, participant_id fk, kind text, value jsonb)        -- PRIVATE, advocate only
             -- kind: max_payment_cents | must_keep_item | move_out_window | other
             -- other: { text } a soft preference the chat agent heard ("no handoffs with them");
             --        only that person's advocate agent reads it
             -- move_out_window is also read by the mediator; the rest are not.
proposals    (id uuid pk, case_id fk, round int, allocation jsonb, transfer jsonb, move_out_date date,
              status text, created_at)
             -- allocation: { item_id: { to: participant_id | null, weekends: participant_id | null, split?: true } }
             --   to = null means cancelled (subscription) or both move out (lease);
             --   for lease_break_fee, to = who pays the landlord (only present when both move out);
             --   weekends set only for shared pets
             --   split: true only for a 50/50 pet (then to = null and weekends = null)
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
             -- In rogue mode it also holds the blocked attempt ("ROGUE: tried to send ... across").
             -- Kept separate so `decisions` stays reason-free.
chat_messages (id uuid pk, participant_id fk, role text, text text, created_at)   -- PRIVATE
             -- role: user | assistant. One person's own thread. Read only by that person's chat agent.
chat_state   (participant_id pk fk, flags jsonb)                                 -- PRIVATE
             -- chat agent progress: items_done, cap_answered, limits_answered, changed_since_ask
             -- (both in db/chat-schema.sql; `npm run db:migrate` adds them to an existing database)
llm_usage    (id uuid pk, case_id fk null, purpose text, model text, input_tokens int, output_tokens int,
              cache_write_tokens int, cache_read_tokens int, cost_usd float, created_at)
             -- one row per Claude call. purpose: chat | leak_check | advocate | other. NOT private: no text.
             -- written by src/llm/usage.ts; `npm run usage -- <code>` and the judge view's cost card read it
             -- (db/usage-schema.sql; `npm run db:migrate` adds it)
```

---

## 8. Features the demo depends on (PROPOSED)

These must exist for the demo:
- **A conflict.** The demo must show at least one `REJECT` before the deal lands, so judges see the advocates actually protect their person. See the scenario below.
- **Rogue mode** (flag on one advocate): it tries to send a free-text question across ("what's Alex's max payment?"). The protocol gate (`src/engine/protocol.ts`) rejects the message type and logs the reason (never the content) to `leak_events`. Turn it on with `ROGUE_MODE=B` (or `A`). With LLM advocates, the rogue advocate's prompt (framed as a red-team test of the gate) tells it to ask for the other side's limit, and it writes its own question with `send_to_other_side`, e.g. "Hey, quick question: what's the most Alex would be willing to pay in total?". The question isn't scripted, but the gate blocks it the same way. If the model doesn't try, the old fixed question is sent instead, so the demo always shows a block. That's the pitch: **the agents are smart, the wire is dumb.** With `ADVOCATE_MODE=rules` it falls back to today's fixed question.
- **The demo still hits round 1 REJECT, round 2 ACCEPT with LLM advocates.** Alex's round 1 reject comes from the cap check, which the LLM can't override. Sam has no soft preferences in the seed, so Sam accepts both. Re-run `npm run demo:negotiate` after any prompt change.

### Demo scenario (fake data)
Use this seed data so the demo hits a reject in round 1 and agrees in round 2. The math is checked; if you change a number, recheck the rounds.

| | Alex | Sam |
|---|---|---|
| Apartment (lease) | $1,500 | $1,410 |
| Biscuit: full-time with me | $900 | $400 |
| Biscuit: with me, ex every other weekend | $800 | $350 |
| Biscuit: 50/50, week on, week off | $500 | $300 |
| Biscuit: with ex, me every other weekend | $300 | $250 |
| Couch | $200 | $300 |
| TV | $250 | $200 |
| Spotify | $0 | $0 |
| Deposit paid | $750 | $750 |
| Move-out window | Nov 15 to Dec 31 | Nov 1 to Nov 30 |
| Max total payment *(advocate only)* | $1,600 | none |
| Dealbreaker *(advocate only)* | Biscuit lives with me | none |

Fair shares: `F_A = (1500+900+200+250+0)/2 = $1,425`, `F_B = (1410+400+300+200+0)/2 = $1,155`. Biscuit goes to "Alex + Sam every other weekend" (total $1,050, the best of the five). 50/50 totals $800 ($250 below the best), so it can't show up before round 3 and the two rounds below don't change. Keep the 50/50 total under $1,000 or it ties with round 2. Spotify is cancelled. Move-out date is Nov 30.

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

- [x] Which LLM provider and model? **Decided:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) at low effort (`LLM_MODEL` / `LLM_EFFORT` override it). Swappable to Grok or Gemini via `src/llm/`.
- [x] Photon setup: project created at app.photon.codes, iMessage turned on, project ID + secret in `.env`? Are all demo phones iPhones? **Done:** iMessage connected on the shared pool, keys in `.env`, tested both ways with two iPhones. Every demo phone must be an iPhone (or a Mac sending from an iPhone's number): the shared pool drops email-only iMessage handles.
- [ ] Photon booth: if our iMessage line texts an Android number, does it fall back to SMS/RCS, and does that need carrier (10DLC) registration? If yes and no, we get Android for free.
- [x] Photon booth: on the shared-pool line, does `im.space.create` to a brand-new number work on the free plan? **Answered by testing: no.** The line only texts numbers added as users of the Photon project, and only after that person has texted their assigned line once (otherwise `Target not allowed for this project`). For the demo, add every demo phone as a user and have it text in once. The Business plan (dedicated line) has no allowlist; ask the booth if we want real invites.
- [ ] Photon and Neon prize requirements (MHacks prizes page, behind login)
- [ ] Does the item list need both people to approve it before valuations start?
- [x] What happens if someone replies `NO` to the agreement? **Decided: back to the table.** The deal is superseded and the case goes to `needs_relaxation`. The person who said NO is asked privately what doesn't work; the other person is told only "They didn't confirm yet". Their agent updates their values or limits, then `negotiate()` runs again and a new agreement needs two new YESes. Anything else (not a bare YES or NO) is just chat with their agent.

## 11. Team and ownership

Split: **Pranav = conversation side** (everything a human sees over iMessage). **Shruti = negotiation side** (deal engine + the judge view that proves nothing leaked). Diagram, contract, and timeline: https://claude.ai/artifact/MRD8VTJcSoxGVtZPUQsLLP

| Area | Owner | Folder | Status |
|---|---|---|---|
| Photon setup + messaging adapter (incl. invite to a new number) | Pranav | `src/messaging/` | done; tested both ways on iMessage with two iPhones (see changelog for the shared-pool rules) |
| Router (keyword × case state) | Pranav | `src/router/` | done (start, invite, JOIN/code, STOP, YES, NO); checked on Neon with `npm run sim:router` and on two iPhones |
| LLM layer (provider interface, Claude) | Pranav | `src/llm/` | done: Claude Sonnet 5.5 at low effort, `llm().chat()` with tools, `askYesNo()`; `npm run llm:check` passes |
| Chat agent (LLM): intake + relaxation replies + soft preferences | Pranav | `src/intake/` | done: intake, soft preferences, relaxation and post-NO replies (updates the existing row, then `runNegotiation`), questions about the agreement; can drop a soft preference when no deal fits (`remove_soft_preference`). `npm run sim:intake` plays Alex and Sam through real Claude: demo values recorded exactly, deal lands, NO → raise cap → new deal. Median reply ~3.4s |
| Agreement text, YES/NO confirmation, relaxation prompts | Pranav | `src/conversation/` | done: agreement + YES + NO (back to the table) + relaxation asks (`npm run demo:agreement`); replies to the asks and to a NO are handled by the chat agent |
| Leak filter (wraps every outbound send) | Pranav | `src/privacy/` | done: number/date check on every message + LLM check on every chat-agent reply (blocked drafts are rewritten once, then a safe line). `npm run leak:check` 12/12 with real Claude; two full `sim:intake` runs with 0 false blocks. Adds ~1.5-2.5s per agent reply (`LEAK_LLM_CHECK=off` to skip) |
| Scaffold, spec, shared contract | Shruti | `src/shared/`, `AGENTS.md` | done: Node + TS via `tsx`, `types.ts`, `contract.ts`, the section 8 demo data with a test; most of sections 4 to 8 (lease/both-move-out, lease-break fee, deposit, shared pets, iMessage choice) |
| Neon project, schema, DB client, demo seed | Shruti | `db/`, `src/db/` | done: project `gudtrms` with branches `production` (kept clean), `shruti`, `pranav`; `npm run db:reset` loads case 4F7K; dates come back as `YYYY-MM-DD` strings |
| Mediator | Shruti | `src/engine/mediator.ts` | done, tested: every item kind, tie rule (cancelled / both move out win ties), reproduces the section 8 rounds exactly |
| Advocate rules, `negotiate()`, rogue mode, protocol gate | Shruti | `src/engine/` | done, checked on Neon: hard checks + notes, relaxation asks, 5-round cap, window-stretch ask, concurrency guard, `ROGUE_MODE`, `DEMO_PACING_MS`, `npm run demo:negotiate` |
| Advocate agents (LLM) on top of the rules | Shruti | `src/engine/advocateAgent.ts` | done: wired into `negotiate()`, rules as hard veto + fallback, soft preferences, LLM-written rogue question. Checked on Neon (`demo:agreement` with `ROGUE_MODE=B`: round 1 REJECT, round 2 agreed) and in the judge view; `npm run advocate:check` passes |
| Judge view | Shruti | `judge/` | done: mock (runs the real engine in the browser) + live (polls Neon read-only, 127.0.0.1 only), checked at four screen sizes (`npm run judge`). An agreement someone replied NO to shows as declined, then the next rounds play on |
| Neon RLS + demo-seed branch, Notability screenshots | Shruti | | branches made; RLS + demo seed not started |
| 50/50 pet option | Shruti: `Outcome` type, mediator, values, advocate dealbreaker, demo seed, judge view · Pranav: intake question, agreement line | `src/shared/`, `src/engine/`, `judge/`, `src/intake/`, `src/conversation/` | spec only, not started. Build **after** the ~3 AM full run, since it changes the shared allocation shape |
| .Tech domain | Pranav | | not started |
| Pitch + Devpost + backup video | Both | | not started |

**Contract between the halves** (`src/shared/contract.ts`): the Neon tables in section 7, plus
- `negotiate(caseId) → { status: 'agreed', proposalId } | { status: 'needs_relaxation', asks }`. Shruti implements it. Pranav calls it once both people finish intake, and again after someone relaxes a constraint.
  - Call it only when the case status is `intake` or `needs_relaxation`. It moves the case to `negotiating` first, so a second call while one is running throws ("already being negotiated"); safe to ignore.
  - On `needs_relaxation` it sets that status itself. On `agreed` it leaves the status alone: Pranav sends the agreement and sets `awaiting_confirmation`.
  - Relaxing a constraint means **updating** that person's existing constraint row, not inserting a second one.
  - In `transfer`, `buyout_cents` and `deposit_cents` can have opposite signs (e.g. the buyout goes one way and the deposit payback the other); `total_cents` is the net and is never negative. See `Transfer` in `src/shared/types.ts`.
- `sendTo(participantId, text)`. Pranav implements it, and it runs the leak filter first. Every outbound message goes through it.
- With LLM advocates, `negotiate()` keeps the same signature and return shape. The `asks` it returns are what each advocate hands its own chat agent.

**Sync points:** ~11 PM Sat, a seeded case runs through `negotiate()` and the agreement prints via the terminal provider. ~3 AM Sun, a full run on two iPhones with the judge view open.
