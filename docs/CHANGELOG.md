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
