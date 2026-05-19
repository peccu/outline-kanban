# syntax=docker/dockerfile:1.7

# ---------- deps (full, for build) ----------
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- build client + verify server ----------
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY client ./client
COPY server ./server
RUN bun run build:client

# ---------- prod deps only ----------
FROM oven/bun:1.3-alpine AS deps-prod
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- runtime ----------
FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5173 \
    DB_PATH=/data/outline-kanban.sqlite

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=build    /app/client/dist  ./client/dist
COPY --from=build    /app/server       ./server
COPY                 package.json      ./

RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun
VOLUME ["/data"]
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:5173/api/health || exit 1

CMD ["bun", "run", "server/index.ts"]
