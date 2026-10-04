# Running gudtrms with Docker

Everything runs from one image (`Dockerfile`) and one `compose.yaml`. You need Docker (Docker Desktop on Windows/Mac) and a filled-in `.env` (copy `.env.example`). Secrets are passed in from `.env` at runtime; they're never baked into the image.

## Services

| Service | Starts with | What it does | Where |
|---|---|---|---|
| `migrate` | `up` (runs first, then exits) | Sets up Neon: on an empty database it creates every table; on an existing one it only adds missing tables. Never drops data | — |
| `bot` | `up` | Photon (iMessage) + router + chat agents + negotiation. `npm start` | — |
| `site` | `up` | Landing page + sign-up (creates the Photon user) | http://localhost:5200 |
| `judge` | `--profile judge` or `--profile https` | Judge view, built into the image and served under `/demo/`. Mock / live toggle (`L`) | http://localhost:5199/demo/ (hosted: https://your-domain/demo) |
| `web` | `--profile judge` | Local mirror of the hosted layout on one address: `/` is the landing page, `/demo` the judge view (same routes as `caddy`, plain HTTP) | **http://localhost:8080** |
| `caddy` | `--profile https` | HTTPS on your `DOMAIN`: `/` is the landing page, `/demo` the judge view (hosting only) | https://your-domain |
| `tunnel` | `--profile tunnel` | Temporary public link to the landing page (Cloudflare quick tunnel), for trying it on a phone without hosting | `docker compose logs tunnel` prints it |

There's no database container: Neon is hosted, so `DATABASE_URL` in `.env` is all it needs.

## Everyday commands

```bash
docker compose up -d --build
```
Builds the image and starts `migrate`, `bot` and `site`. Rerun it after pulling new code.

```bash
docker compose --profile judge up -d
```
Also starts the judge view, plus a local copy of the hosted layout: **http://localhost:8080** is the landing page and **http://localhost:8080/demo** the judge view, exactly like `gudtrms.tech` and `gudtrms.tech/demo`. The judge view opens on mock data; press `L` (or add `?mode=live`) to watch Neon. (Each service also has its own port, 5200 and 5199. 5199 only serves the judge view, so it redirects to `/demo/`.)

```bash
docker compose logs -f bot
```
Follow the bot's logs. They never contain message text (privacy rule 6).

```bash
docker compose down
```
Stops everything.

Any npm script runs in a one-off container, for example `docker compose run --rm bot npm run db:reset` (wipes the database `DATABASE_URL` points at and loads the demo case; stop the bot first with `docker compose stop bot`) or `docker compose run --rm bot npm run sim:intake`.

**Terminal mode** (play both people without phones): `docker compose run --rm -e MESSAGING_PROVIDER=terminal bot`. The chat UI downloads once and is cached in a volume.

## Opening the landing page on your phone

The site only listens on this computer, so your phone can't reach `localhost:5200`. Start a temporary public link instead (works on Wi-Fi or cellular, no account needed):

```bash
docker compose --profile tunnel up -d
```

Then find the `https://<random>.trycloudflare.com` link in the tunnel's logs and open it on your phone:

```bash
docker compose logs tunnel
```

The link changes every time the tunnel restarts, and anyone with it can sign up (the 5-per-IP rate limit still applies). Stop it with `docker compose stop tunnel`. For a permanent link, host it (below).

## Things to know

- **One bot per Photon project.** If your laptop (or a teammate's) is also running `npm start` with the same Photon keys, both bots answer every message. Stop the others before `docker compose up`.
- **`MESSAGING_PROVIDER=imessage`** in `.env` for the real thing. The default `terminal` needs an interactive terminal, so under `up -d` it can't run; use the `run` command above instead.
- **Ports already in use?** Set `WEB_PORT`, `SITE_PORT` or `JUDGE_PORT` in `.env` (for example `JUDGE_PORT=5299` if `npm run judge` is already running outside Docker). They're only ever published on 127.0.0.1; the internet only reaches them through Caddy.
- **"`.env` not found"** used to print on every start: the npm scripts pass `--env-file-if-exists=.env`, and the real `.env` is deliberately kept out of the image (compose passes its values in as environment variables instead). The image now has an empty placeholder `.env`, so the message is gone. Real environment variables always win over it.
- **Logs** are capped at 3 × 10 MB per container, so they can't fill the server's disk.
- **New database:** `migrate` creates the tables but no demo data. For the section 8 demo case, run `db:reset` as above.

## Hosting on AWS with a custom domain

One small **AWS Lightsail** server runs the whole stack, and Caddy handles HTTPS: `https://gudtrms.tech` is the landing page and `https://gudtrms.tech/demo` the judge view. Lightsail is a fixed monthly price and simpler than EC2 or App Runner for this.

**Why not Vercel?** Vercel runs short-lived serverless functions, and the bot is a long-running process that keeps a live connection to Photon and answers texts in the background, sometimes for longer than a function may run. The landing page alone could go on Vercel, but the bot needs a server anyway, so one server for everything is simpler. It doesn't have to be AWS: any server with Docker works the same way (DigitalOcean, Hetzner, a spare machine).

1. **Create the server.** In Lightsail: Create instance, then Linux, **Ubuntu 24.04 LTS**, **2 GB** plan (1 GB works but is tight while the image builds). Under Networking, create a **static IP** and attach it. In the instance's IPv4 firewall, add **HTTPS (443)** (SSH and HTTP are open by default). Don't open 5200 or 5199.
2. **Point the domain at it.** At your registrar (or Route 53), add an `A` record for `@` and one for `www`, both to the static IP.
3. **Install Docker and get the code.** In Lightsail's browser SSH:
   ```
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   git clone https://github.com/PRANAVMAHALINGAM/gudtrms.git && cd gudtrms
   cp .env.example .env && nano .env && chmod 600 .env
   ```
   In `.env`, fill in the real keys, set `MESSAGING_PROVIDER=imessage`, and set `DOMAIN=gudtrms.tech` (no `https://`, no `www`). If the repo is private, `git clone` asks for a GitHub personal access token.
4. **Start it:**
   ```
   docker compose --profile https up -d --build
   ```
   Caddy gets the HTTPS certificate on its own once DNS points at the server (usually within a few minutes), and renews it. `www.` redirects to the bare domain. Everything restarts on its own after a crash or a reboot.
5. **Update later:** `git pull && docker compose --profile https up -d --build`.

**The judge view is an open link.** The team chose this for the hackathon demo (AGENTS.md section 8). Anyone with `https://gudtrms.tech/demo` can see the live case, including both people's private answers, so only use fake data or people who know it's a demo. To take it offline: `docker compose stop judge` (the landing page keeps running).

**Check after the first deploy:** sign up on the live site with a new iPhone number and text `start`. The 10-03 changelog saw a running bot miss texts from a Photon user created after it started. If the bot doesn't reply, `docker compose restart bot` gets it going.
