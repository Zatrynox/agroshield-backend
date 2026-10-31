# syntax=docker/dockerfile:1.7
# Standalone production image for the AgroShield API.
#
#   docker build -t agroshield-backend:local .
#   docker run --rm -p 3000:3000 --env-file .env agroshield-backend:local
#
# Production requires PostgreSQL and a real SESSION_SECRET. See .env.example.

ARG NODE_IMAGE=node:24.15.0-alpine3.22@sha256:b689d4005875ae167178471a7a622ec2909459a3bbb32277260be1971af7a99f

# ---------- build ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN npm install --global pnpm@11.1.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build \
 && pnpm prune --prod \
 && rm -rf .data .env .env.* src dist/test eslint.config.js .dependency-cruiser.cjs \
      tsconfig.json tsconfig.build.json vitest.config.ts \
 && test -f dist/main.js \
 && test -f dist/tools/migrate.js \
 && test -f dist/tools/seed.js \
 && test -f migrations/0001_core.sql

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime

RUN apk upgrade --no-cache \
 && apk add --no-cache tini \
 && addgroup -g 10001 -S app \
 && adduser -u 10001 -S -G app -H -s /sbin/nologin app \
 && rm -rf /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app
COPY --from=build --chown=app:app /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/migrations ./migrations

# The demo seed writes sensor keys into /app/.data. Creating the directory in
# the image gives the named demo-secrets volume the right owner on first use.
RUN mkdir -p /app/.data/demo-keys && chown -R app:app /app/.data

ENV NODE_ENV=production \
    APP_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000 \
    HOME=/tmp

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || '3000') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
