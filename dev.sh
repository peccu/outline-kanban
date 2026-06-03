#!/usr/bin/env bash
#
# Local preview environment for outline-kanban.
#
# Runs a dev API server + Vite client on dedicated ports against a separate
# SQLite DB and attachments dir, so it never collides with the docker-compose
# deployment (which uses port 8787 and /data). Lets you eyeball local changes
# without waiting for the GitHub Actions image build.
#
# Usage:
#   ./dev.sh            # start (foreground; Ctrl+C stops both). alias of `start`
#   ./dev.sh start      # same, with --seed to also load sample data
#   ./dev.sh start --seed
#   ./dev.sh seed       # (re)load sample data into a running preview
#   ./dev.sh stop       # kill whatever is listening on the preview ports
#   ./dev.sh reset      # stop + delete the preview DB & attachments
#   ./dev.sh status     # show whether the ports are up
#
# Override any of these via env vars:
#   PREVIEW_API_PORT (9787)  PREVIEW_APP_PORT (9788)
#   PREVIEW_DB (outline-kanban-preview.sqlite)
#   PREVIEW_ATTACHMENTS (attachments/preview)
set -euo pipefail

cd "$(dirname "$0")"

API_PORT="${PREVIEW_API_PORT:-9787}"
APP_PORT="${PREVIEW_APP_PORT:-9788}"
DB="${PREVIEW_DB:-outline-kanban-preview.sqlite}"
ATTACHMENTS="${PREVIEW_ATTACHMENTS:-attachments/preview}"
API_URL="http://localhost:${API_PORT}"
APP_URL="http://localhost:${APP_PORT}"

have() { command -v "$1" >/dev/null 2>&1; }

kill_port() {
  local port="$1"
  if have lsof; then
    local pids
    pids="$(lsof -ti:"$port" 2>/dev/null || true)"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  fi
}

wait_ready() {
  local url="$1" name="$2" i
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "timed out waiting for $name ($url)" >&2
  return 1
}

seed() {
  wait_ready "${API_URL}/api/lanes" "API" || exit 1
  API_URL="$API_URL" bun run scripts/seed-sample.ts
}

cmd_stop() {
  echo "stopping preview (ports ${API_PORT}, ${APP_PORT})…"
  kill_port "$API_PORT"
  kill_port "$APP_PORT"
}

cmd_status() {
  for p in "$API_PORT" "$APP_PORT"; do
    if curl -sf "http://localhost:${p}" >/dev/null 2>&1 \
      || curl -sf "http://localhost:${p}/api/lanes" >/dev/null 2>&1; then
      echo "port ${p}: up"
    else
      echo "port ${p}: down"
    fi
  done
}

cmd_reset() {
  cmd_stop
  rm -f "$DB" "$DB-shm" "$DB-wal"
  rm -rf "$ATTACHMENTS"
  echo "removed ${DB} and ${ATTACHMENTS}"
}

cmd_start() {
  local do_seed=0
  [ "${1:-}" = "--seed" ] && do_seed=1

  if ! have bun; then echo "bun is required (https://bun.sh)" >&2; exit 1; fi

  # Make sure the ports are free first.
  kill_port "$API_PORT"
  kill_port "$APP_PORT"

  echo "preview API → ${API_URL}   (DB: ${DB}, attachments: ${ATTACHMENTS})"
  echo "preview app → ${APP_URL}"

  PORT="$API_PORT" DB_PATH="$DB" ATTACHMENTS_DIR="$ATTACHMENTS" NODE_ENV=development \
    bun run --watch server/index.ts &
  local api_pid=$!

  E2E_APP_PORT="$APP_PORT" E2E_API_TARGET="$API_URL" \
    bunx vite --config client/vite.config.ts &
  local app_pid=$!

  # Clean up both children on Ctrl+C / exit.
  trap 'echo; echo "stopping…"; kill "$api_pid" "$app_pid" 2>/dev/null || true' INT TERM EXIT

  if [ "$do_seed" = 1 ]; then
    ( seed ) || echo "seed failed (continuing)"
  fi

  echo
  echo "open ${APP_URL}  (Ctrl+C to stop)"
  wait
}

case "${1:-start}" in
  start) shift || true; cmd_start "${1:-}";;
  seed)  seed;;
  stop)  cmd_stop;;
  reset) cmd_reset;;
  status) cmd_status;;
  *) echo "usage: ./dev.sh [start [--seed] | seed | stop | reset | status]" >&2; exit 1;;
esac
