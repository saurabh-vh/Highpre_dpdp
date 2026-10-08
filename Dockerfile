# syntax=docker/dockerfile:1
# ── Desktop agent (Go, cross-compiled for Windows and macOS) ─────────
# Automatic updates are signed with an Ed25519 key passed as a build secret:
#   docker build --secret id=agent_update_key,src=agent-update-key.pem .
# Without it the agent builds fine but never updates itself.
FROM golang:1.23-alpine AS agent
RUN apk add --no-cache nodejs
WORKDIR /agent
COPY agent/ ./
RUN --mount=type=secret,id=agent_update_key \
    go test ./... && \
    AGENT_UPDATE_SIGNING_KEY_FILE=$([ -s /run/secrets/agent_update_key ] && echo /run/secrets/agent_update_key) node build.mjs

# ── Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Run ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=agent --chown=app:app /agent/dist ./agent/dist
COPY --from=build --chown=app:app /app/extension ./extension
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
