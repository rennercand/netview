FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate
RUN chown -R node:node /app
USER node
FROM base AS services
CMD ["pnpm","--filter","@family/api","start"]
FROM base AS web-build
RUN pnpm build
FROM caddy:2.10-alpine AS web
COPY --from=web-build /app/apps/web/dist /srv
COPY infrastructure/Caddyfile.web /etc/caddy/Caddyfile
EXPOSE 8080
