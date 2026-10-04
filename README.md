# gudtrms

"Good terms." An iMessage mediator for breakups: each person gets their own AI advocate, and the deal gets made without anyone's secrets leaking. Built at MHacks 2026.

The spec, the work split, and the rules for contributing are in [`AGENTS.md`](AGENTS.md). Log every change in [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Setup

Needs Node 22.9 or newer.

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL (your own Neon branch) and the Spectrum keys
npm run db:reset       # WIPES the database, recreates tables, loads the demo scenario
npm test
npm run demo:negotiate # runs negotiate() on the demo case; db:reset first for a clean run
npm run dev            # Photon hello world (terminal only until Spectrum keys are set)
```

## Layout

| Path | Owner | What |
|---|---|---|
| `src/shared/` | both | Types, the contract (`negotiate`, `sendTo`), demo scenario data. Tell your teammate before changing. |
| `db/` | Shruti | `schema.sql` and the reset/seed script |
| `src/db/` | Shruti | Neon client |
| `src/engine/` | Shruti | Mediator, advocates, `negotiate()`, rogue mode (protocol gate) |
| `judge/` | Shruti | Localhost-only judge view |
| `src/index.ts`, `src/messaging/` | Pranav | Photon Spectrum |
| `src/router/` | Pranav | Keyword × case-state routing |
| `src/intake/` | Pranav | LLM intake agent |
| `src/conversation/` | Pranav | Agreement text, YES, relaxation prompts |
| `src/privacy/` | Pranav | `sendTo` + leak filter |
| `site/`, `src/site/` | Pranav | Public landing page + sign-up (creates the Photon user). `npm run site` |
