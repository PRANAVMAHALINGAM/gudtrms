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
