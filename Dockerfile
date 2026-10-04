# One image for every service in compose.yaml (bot, site, judge, migrate). See docs/DOCKER.md.
# TypeScript runs through tsx like it does locally, so only the judge view has a build step.
FROM node:22-bookworm-slim

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, so code changes don't reinstall them. Dev dependencies are needed: tsx runs the
# app, and Vite builds and serves the judge view.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node judge/package.json judge/package-lock.json ./judge/
RUN npm --prefix judge ci --no-audit --no-fund

COPY --chown=node:node . .

# Secrets come from compose (env_file: .env) as environment variables, never from a file in the image.
# The npm scripts still pass --env-file-if-exists=.env, so an empty placeholder keeps Node from
# printing ".env not found" on every start. Real environment variables always win over the file.
RUN touch .env

# The judge view, built for https://<DOMAIN>/demo (served by `vite preview` in the judge service).
RUN JUDGE_BASE=/demo/ npm --prefix judge run build

CMD ["npm", "start"]
