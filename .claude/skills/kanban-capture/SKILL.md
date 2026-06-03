---
description: Drop items into the outline-kanban board (Inbox by default) and track their status. Use when the user wants to capture/file something onto the board — a code-review request, a Slack message, an MR/PR link, a TODO/note — or to list/advance their captured cards (e.g. "これをボードに入れて", "inbox に放り込んで", "レビュー依頼を取り込んで", "この MR をボードに", "inbox 見せて", "X を Doing に動かして", "X を done にして"). Backed by the repo's capture CLI (scripts/capture.ts). Do NOT use for editing card contents in bulk or board-wide config.
---

# outline-kanban quick capture

A low-friction intake for the outline-kanban board. Cards land in the **Inbox**
lane by default; **lanes are the status**, so you advance an item by moving it
between lanes (Inbox → Today/Doing → Done). Tags are optional metadata
(`review`, a repo name, a requester, …).

This skill drives the repo CLI — never hand-write the HTTP calls.

## Target board

The CLI talks to `OUTLINE_KANBAN_URL` (default `http://localhost:8787`, the
`docker compose` deployment). For a local/preview board use the preview port:

```bash
export OUTLINE_KANBAN_URL=http://localhost:9788   # if previewing via ./dev.sh (API 9787; either works)
```

If a command reports "cannot reach …", the board isn't running. Tell the user
to start it (`docker compose up -d`, or `./dev.sh start` for a preview) — don't
silently switch targets.

## Commands

Run from the repo root (wrapper: `./capture.sh …`, or `bun run scripts/capture.ts …`):

```bash
./capture.sh add "<title>" [--url URL] [--by NAME] [--lane LANE] [--tag T]... [--body TEXT]
./capture.sh list [--lane LANE] [--tag T] [--all]
./capture.sh move <id|title> <LANE>
./capture.sh done <id|title>
./capture.sh open            # prints the board URL
```

`<id|title>` matches by full id, id prefix, or an unambiguous title substring.

## How to handle a capture request

1. **Title** — keep it short and scannable.
   - For an MR/PR link, prefer the real MR title. If the user pasted only a URL
     and `glab` / `gh` is available, fetch it: `glab mr view <url> -F json` →
     `.title`, or `gh pr view <url> --json title -q .title`. If you can't, derive
     a sensible title from the URL (e.g. "Review !128 (acme/api)").
   - For a Slack message, summarize it into one line; keep the link/permalink.
2. **Enrich** — pass `--url` for any link, `--by` for the requester, and tags as
   useful. For code-review requests add `--tag review` (and often the repo name,
   e.g. `--tag api`). Pasted free-form notes need no tag.
3. **Add** — call `./capture.sh add …`. Echo back the one-line confirmation.
4. **Avoid dupes** — if it looks like it might already be on the board, run
   `./capture.sh list --tag review` (or `--all`) first and skip / mention it.

## Advancing status

- "X を Doing に / Today に動かして" → `./capture.sh move "X" Doing`
- "X 終わった / done" → `./capture.sh done "X"`
- "inbox 見せて" → `./capture.sh list` ; "レビュー一覧" → `./capture.sh list --tag review`

## Examples

```bash
# A code-review request from Slack
./capture.sh add "Review !128 payment retry" \
  --url https://gitlab.example.com/acme/api/-/merge_requests/128 --by alice --tag review --tag api

# A quick note
./capture.sh add "Flaky e2e on CI — investigate" --tag chore

# Look at what's waiting, then start one
./capture.sh list --tag review
./capture.sh move "payment retry" Doing
```
