FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,target=/run/secrets/extra_ca \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install --global pnpm@11.25.0 --fetch-retries=0 --fetch-timeout=20000
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN --mount=type=secret,id=extra_ca,target=/run/secrets/extra_ca \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate
RUN chown -R node:node /app
USER node
FROM base AS services
CMD ["pnpm","--filter","@family/api","start"]
FROM base AS web-build
RUN pnpm build
FROM caddy:2.10-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS web
COPY --from=web-build /app/apps/web/dist /srv
COPY infrastructure/Caddyfile.web /etc/caddy/Caddyfile
EXPOSE 8080
