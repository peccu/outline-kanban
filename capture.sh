#!/usr/bin/env bash
# Quick intake into the outline-kanban Inbox, from anywhere:
#   ./capture.sh add "Look into flaky test"
#   ./capture.sh add "Review !128" --url https://… --tag review
#   ./capture.sh list
# Target board: $OUTLINE_KANBAN_URL (default http://localhost:8787).
set -euo pipefail
cd "$(dirname "$0")"
exec bun run scripts/capture.ts "$@"
