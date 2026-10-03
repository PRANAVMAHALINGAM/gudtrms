# router (owner: Pranav)

Maps a handle to a participant and case, then routes by keyword + case state. The table of which keyword counts when is in AGENTS.md section 6.

- `index.ts`: `route(handle, text)`, called by `src/index.ts` for every inbound message.
- `keywords.ts`: pure parsing (keywords, case codes, names, "Sam 734 555 1234"). Tested in `keywords.test.ts`.
- `cases.ts`: Neon queries for cases, participants and opt-outs. Never reads private tables.
- `messages.ts`: every fixed text the router sends, including the one invite.

## Flow

1. `start` (no open case) → case created as `inviting`, A gets the case code and is asked their first name.
2. A's name → asked for the ex's first name + number (number required, name optional).
3. Number → checked against opt-outs, A's own number, and open cases (one generic "can't invite" reply for all three). Then the fixed invite goes out once and `invite_sent_at` is set. If Photon refuses the number, A gets the case code to pass on instead.
4. B replies `JOIN` (or texts the code, from any number) → `joined_at` set, case → `intake`, A is told, and `startIntake` runs for both.
5. `YES` while `awaiting_confirmation` → `confirmAgreement` in `src/conversation/confirm.ts`. Both YES → case `closed`.
6. `STOP` any time → `opt_outs`, open case closed, the other person (if joined) told only that it ended / they didn't join. An opted-out number gets no replies unless it texts `start` or a code itself.
7. Everything else → `handleAgentMessage` in `src/intake` (still a stub).

Run `npm run sim:router` to play all of this against Neon with fake numbers.
