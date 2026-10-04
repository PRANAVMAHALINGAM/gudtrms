# judge view (owner: Shruti)

The screen we show judges while two teammates act out a breakup on their phones. Each ex's side shows what their advocate privately knows; the masking tape down the middle shows **only what crosses the line**. See AGENTS.md section 8.

**Hosted as an open link at https://gudtrms.tech/demo for the hackathon** (team decision, see AGENTS.md section 8). It's the one place allowed to read private data, so run it on fake data or people who know it's a demo.

## Run it

```bash
npm run judge:install   # once (its own deps live in judge/, separate from the root)
npm run judge           # http://127.0.0.1:5199
```

Or in Docker: `docker compose --profile judge up -d` serves the built app at http://localhost:5199/demo/ (`vite build` with `JUDGE_BASE=/demo/`, then `vite preview`). When hosted, Caddy puts it at `https://<DOMAIN>/demo`. See `docs/DOCKER.md`.

- **Mock** (default): the section 8 demo, negotiated in the browser by the real mediator and advocates from `src/engine`. No database needed.
- **Live**: polls `GET /api/snapshot` every second, which reads Neon using `DATABASE_URL` from the repo's `.env` (or `JUDGE_DATABASE_URL` for a read-only role). Every poll is one `READ ONLY` transaction. Shows the case with the most recent activity; add `?code=4F7K` to pin one.
- Pick with the Mock / Live toggle, `L`, or `?mode=live` in the URL.

Live demo flow: open the judge view in Live, then run the negotiation. For a dry run:

```bash
npm run db:reset
ROGUE_MODE=B DEMO_PACING_MS=1500 npm run demo:negotiate
```

The agreement's signatures fill in when `agreements.a_confirmed` / `b_confirmed` are set (the YES flow), and then the screen tears.

## Shortcuts

| Key | Does |
|---|---|
| `X` | Declassify / re-redact both sides |
| `Space` | Play / pause |
| `R` | Replay from the start |
| `←` `→` | Step back / forward |
| `1` `2` | Speed 1x / 2x |
| `F` | Is it fair? (math breakdown + fairness playground in mock) |
| `L` | Mock / live |
| `M` | Mute |
| `?` | Shortcuts |

Click any item card for both exes' values for it (when declassified) and why it went where it did.

## Layout

- `server/snapshot.ts`: the read-only query. `vite.config.ts` mounts it at `/api/snapshot` and binds to 127.0.0.1.
- `src/data/`: `mock.ts` (runs the real engine), `timeline.ts` (rows → steps → what the screen shows at a step), `hooks.ts` (polling, playback).
- `src/components/`: `Side` (private panel, redaction, monologue, moving box), `TapeZone` (the line, proposal card, stamps, rogue hit), `Overlays` (agreement and split, math, item detail, shortcuts), `Chrome` (header, timeline, math panel, leak log).
- Fonts are bundled (Fontsource), so it works offline.
