# site (owner: Pranav)

The public landing page and sign-up. Unlike `judge/`, this one is meant to be hosted: it reads no case data and never touches Neon.

```bash
npm run site   # http://127.0.0.1:5200
```

- `site/` (repo root): the page itself. Plain `index.html`, `styles.css` and `app.js`, no build step. Same tokens and look as the judge view (`judge/src/theme.css`).
- `server.ts`: serves those three files and `POST /api/signup`. Rate limit: 5 sign-ups per IP per 10 minutes, plus a hidden honeypot field.
- `signup.ts`: checks the form (name, phone → E.164 via `normalizePhone`, email using Photon's own pattern).
- `photon.ts`: `createSharedUser()` calls Photon's management API, `POST https://spectrum.photon.codes/projects/{id}/users/` with `type: "shared"`, using the `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` keys. Photon assigns a shared-pool number (`assignedPhoneNumber`). The page shows it and links **Start texting** to `sms:<number>&body=start`.

## How it fits the shared pool rules

On the Free/Pro shared pool, gudtrms can only text people who are (1) Photon project users and (2) have texted their assigned line once (AGENTS.md section 10). Signing up does (1). Tapping **Start texting** and hitting send does (2), and the `start` also opens their case through the router.

- **iOS never lets a web page send an iMessage on someone's behalf.** The button opens Messages with `start` already typed; the person taps send.
- Signing up again with the same number is safe: Photon returns the same user and line, and updates the name and email.
- An ex who was invited can sign up too, then text the case code instead of `start` (there's a box for it on the success screen).

## Hosting

Use Docker: `docker compose --profile https up -d --build` runs the site behind Caddy (HTTPS on your `DOMAIN`) alongside the bot. Step-by-step AWS guide: [`docs/DOCKER.md`](../../docs/DOCKER.md).

Without Docker, any Node 22+ host that runs a long-lived process works: set the two Spectrum keys, `HOST=0.0.0.0`, `TRUST_PROXY=1` (behind a proxy), let the host set `PORT`, and start with `npm run site`.
