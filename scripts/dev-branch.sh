#!/usr/bin/env bash
#
# Per-branch dev server for outline-kanban.
#
# Spins up an API + Vite dev server for a given branch on automatically
# allocated, branch-stable ports, against a per-branch SQLite DB and
# attachments dir. This lets you run several branches' dev servers at the
# same time without colliding with each other, with `bun run dev` (9787/9788),
# or with the docker container (8787).
#
# By default it also creates/reuses a git worktree under .claude/worktrees/<slug>
# and symlinks node_modules from the main checkout, so each branch gets its own
# working tree but shares installed deps.
#
# Usage:
#   ./scripts/dev-branch.sh <branch>            # reuse existing branch
#   ./scripts/dev-branch.sh <branch> --new      # create <branch> off current HEAD
#   ./scripts/dev-branch.sh <branch> --here     # don't touch worktrees; run in CWD
#
# Ports are derived from the branch name (stable across restarts) within
# 9800-9897, then bumped to the next free pair if occupied. The API port is
# even, the app port is API+1.
#
# Override the search range or skip worktree handling via env vars:
#   DEVBRANCH_PORT_BASE (9800)   DEVBRANCH_PORT_SLOTS (49)
#
# Each instance prints its own URLs; Ctrl+C stops that instance only.
set -euo pipefail

MAIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

have() { command -v "$1" >/dev/null 2>&1; }

die() { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- args ---------------------------------------------------------------
BRANCH=""
MODE="reuse"   # reuse | new | here
for arg in "$@"; do
  case "$arg" in
    --new)  MODE="new" ;;
    --here) MODE="here" ;;
    -h|--help) usage 0 ;;
    -*) die "unknown flag: $arg" ;;
    *)  [ -z "$BRANCH" ] && BRANCH="$arg" || die "unexpected argument: $arg" ;;
  esac
done

have bun || die "bun is required (https://bun.sh)"
have git || die "git is required"

if [ -z "$BRANCH" ]; then
  BRANCH="$(git -C "$MAIN_ROOT" rev-parse --abbrev-ref HEAD)"
  echo "no branch given; using current branch: $BRANCH"
fi

# Filesystem-safe slug for dirs / DB names (slashes etc. -> '-').
SLUG="$(printf '%s' "$BRANCH" | tr '/' '-' | tr -cs 'A-Za-z0-9._-' '-')"

# --- worktree -----------------------------------------------------------
if [ "$MODE" = "here" ]; then
  WORKDIR="$(pwd)"
else
  WORKDIR="$MAIN_ROOT/.claude/worktrees/$SLUG"
  if [ ! -d "$WORKDIR" ]; then
    mkdir -p "$MAIN_ROOT/.claude/worktrees"
    if [ "$MODE" = "new" ]; then
      echo "creating worktree + branch '$BRANCH' at $WORKDIR"
      git -C "$MAIN_ROOT" worktree add -b "$BRANCH" "$WORKDIR"
    else
      echo "creating worktree for existing branch '$BRANCH' at $WORKDIR"
      git -C "$MAIN_ROOT" worktree add "$WORKDIR" "$BRANCH"
    fi
  else
    echo "reusing worktree at $WORKDIR"
  fi
  # Share installed deps with the main checkout.
  if [ ! -e "$WORKDIR/node_modules" ] && [ -d "$MAIN_ROOT/node_modules" ]; then
    ln -s "$MAIN_ROOT/node_modules" "$WORKDIR/node_modules"
    echo "linked node_modules -> $MAIN_ROOT/node_modules"
  fi
fi

# --- port allocation ----------------------------------------------------
PORT_BASE="${DEVBRANCH_PORT_BASE:-9800}"
PORT_SLOTS="${DEVBRANCH_PORT_SLOTS:-49}"

# Stable starting slot from the branch name (djb2-ish hash, pure shell).
hash=5381
for ((i = 0; i < ${#SLUG}; i++)); do
  c=$(printf '%d' "'${SLUG:$i:1}")
  hash=$(( (hash * 33 + c) & 0x7fffffff ))
done
slot=$(( hash % PORT_SLOTS ))

port_free() { ! lsof -ti:"$1" >/dev/null 2>&1; }

API_PORT=""
for ((n = 0; n < PORT_SLOTS; n++)); do
  cand=$(( PORT_BASE + ((slot + n) % PORT_SLOTS) * 2 ))
  if port_free "$cand" && port_free "$(( cand + 1 ))"; then
    API_PORT="$cand"
    break
  fi
done
[ -n "$API_PORT" ] || die "no free port pair in ${PORT_BASE}-$(( PORT_BASE + PORT_SLOTS * 2 ))"
APP_PORT=$(( API_PORT + 1 ))

DB="$WORKDIR/outline-kanban-$SLUG.sqlite"
ATTACHMENTS="$WORKDIR/attachments/$SLUG"
API_URL="http://localhost:$API_PORT"
APP_URL="http://localhost:$APP_PORT"

# --- run ----------------------------------------------------------------
echo
echo "branch:      $BRANCH"
echo "workdir:     $WORKDIR"
echo "preview API → $API_URL   (DB: $DB)"
echo "preview app → $APP_URL"
echo

cd "$WORKDIR"

PORT="$API_PORT" DB_PATH="$DB" ATTACHMENTS_DIR="$ATTACHMENTS" NODE_ENV=development \
  bun run --watch server/index.ts &
api_pid=$!

E2E_APP_PORT="$APP_PORT" E2E_API_TARGET="$API_URL" \
  bunx vite --config client/vite.config.ts &
app_pid=$!

trap 'echo; echo "stopping ($BRANCH)…"; kill "$api_pid" "$app_pid" 2>/dev/null || true' INT TERM EXIT

echo "open $APP_URL  (Ctrl+C to stop this instance)"
wait
