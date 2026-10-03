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
