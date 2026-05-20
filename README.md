# outline-kanban

Personal, single-user Kanban with an outliner inside every card — built for
people who think in `org-mode` and want something lighter than Wekan.

- **Stack:** Vue 3 + Tiptap + Tailwind v4 on the client, Hono +
  `@hono/zod-openapi` on the server, Drizzle ORM over SQLite, all on Bun.
- **Lanes** are user-defined (no hardcoded Inbox/Today/Doing/Done — those are
  just seeded defaults), and you can add / rename / collapse / delete them at
  runtime.
- **Cards** are outline nodes: every card can have nested children, you indent
  with Tab, outdent with Shift+Tab, jump siblings with M-Enter, and reorder
  across lanes with Shift+←/→.
- **Tags** are `#mentions` typed inline in the title; they auto-attach /
  detach as you edit the title.
- **Details** (description + threaded comments) render Markdown (GFM, task
  lists, code, tables…) and switch to a textarea on double-click or Enter.
- **PWA**: installable as a standalone desktop / mobile app; works briefly
  offline via a small service worker.

---

## Quick start

```bash
bun install
bun run dev          # client on :8788, server (+ Swagger UI) on :8787
```

Open <http://localhost:8788>. The Swagger UI for the API lives at
<http://localhost:8787/docs>.

On first boot the server creates `outline-kanban.sqlite` next to the repo,
runs Drizzle migrations, and seeds four default lanes (Inbox / Today / Doing /
Done) so the board isn't empty.

### Production / Docker

The published image lives at `ghcr.io/peccu/outline-kanban` (pushed by
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) on every `main`
build).

```bash
docker compose up -d
# → http://localhost:8787
```

The DB file is stored in a named volume (`outline-kanban-data`), mounted at
`/data/outline-kanban.sqlite` inside the container. Override `DB_PATH` /
`PORT` via env if you want to move it elsewhere.

### Logging

The server honors `LOG_LEVEL` (`debug` / `info` / `warn` / `error` / `silent`,
default `info`). Request logging happens at:

- `error` for any 5xx response,
- `warn` for 4xx,
- `info` for everything else (one line per request).

So `LOG_LEVEL=warn` keeps only the noisy / interesting requests, and
`LOG_LEVEL=silent` turns request logging off entirely. Startup banners use
`info`.

```bash
LOG_LEVEL=warn docker compose up -d         # ad-hoc
LOG_LEVEL=warn bun run dev                  # local
```

The Docker container also caps stored log volume to **30 MB per service**
(`10m × 3` rotated json files) so a long-running deploy can't fill the
host disk. Tune `logging.options` in `docker-compose.yml` if you need
more / less retention.

> The project deliberately uses `8787` (server) and `8788` (Vite dev) instead
> of Vite's `5173`/`5174` defaults, so it doesn't fight any other JS dev
> server you might be running in parallel.

---

## Keyboard shortcuts

The whole app is meant to be drivable from the keyboard.

### On a focused card (view mode)

| Key                  | Action                                               |
| -------------------- | ---------------------------------------------------- |
| `↑` / `↓`            | Move focus to the prev / next card in the same lane (the `+ add` button is the last item in the chain) |
| `←` / `→`            | Move focus to the first card in the adjacent lane    |
| `Enter` / `e` / `F2` | Enter title-edit mode                                |
| double-click         | Enter title-edit mode                                |
| single-click         | Focus card + open the detail modal (after a short delay so dblclick can override) |
| `o`                  | Open the detail modal                                |
| `M-Enter`            | Create a sibling card below                          |
| `Shift+←/→`          | Move the card to the adjacent lane                   |
| `M-←/→`              | Outdent / indent within the outline                  |
| `Backspace`          | Delete the card if empty                             |

### Inside the inline title editor

| Key             | Action                                          |
| --------------- | ----------------------------------------------- |
| `Enter`         | Save & leave edit mode                          |
| `Escape`        | Same as `Enter`                                 |
| `M-Enter`       | Save & create a sibling card                    |
| `Tab`           | 4-step move cycle: indent → origin → lane root → parent's level → … |
| `Shift+Tab`     | Outdent one level                               |
| `M-←/→`         | Outdent / indent                                |
| `Shift+←/→`     | Move the card to the adjacent lane              |
| `#name`         | Start a tag mention (auto-creates if new)       |

### In the detail modal

| Key                | Action                                                 |
| ------------------ | ------------------------------------------------------ |
| double-click title | Edit the title inline (same `#mention` UX as the board) |
| `Enter` on body    | Switch the description into edit mode                  |
| double-click body  | Same                                                   |
| `M-Enter` / `Esc`  | Save the description and return to the rendered view   |
| `Escape` (global)  | Close the modal                                        |

---

## Layout

```
client/
  index.html, vite.config.ts
  public/                  # PWA manifest, service worker, icons
  src/
    api/                   # generated openapi types + a tiny fetch client
    components/            # KanbanBoard, LaneHeader, OutlinePanel,
                           # NodeRow, NodeDetailModal, OutlinerEditor,
                           # mention-suggestion, card-nav, focus-bus,
                           # tab-cycle, drop-state, hidden-lanes …
    lib/markdown.ts        # marked + DOMPurify
    main.ts, App.vue, style.css

server/
  index.ts                 # Hono app, static handler, swagger
  api/                     # zod-openapi routes (lanes, nodes, tags, comments)
  db/                      # Drizzle schema, migrations, seed
  lib/                     # fractional sort-key helpers etc.

scripts/
  gen-icons.ts             # PNG icon rasterizer (Playwright)
  e2e-*.ts                 # Playwright-based smoke / focus / DnD / PWA tests
```

---

## API

OpenAPI 3.1 spec at `/api/openapi.json`, browsable Swagger UI at `/docs`.
The TypeScript client (`client/src/api/schema.gen.ts`) is generated from
that spec via `bun run gen:types` while the dev server is running.

Routes (see `server/api/routes/*.ts` for shapes):

- `GET    /api/lanes` · `POST /api/lanes` · `PATCH /api/lanes/{id}` ·
  `POST /api/lanes/{id}/reorder` · `DELETE /api/lanes/{id}`
- `GET    /api/nodes` (filter by `laneId`, `parentId`, `status`)
- `GET    /api/nodes/{id}` · `POST /api/nodes` ·
  `PATCH /api/nodes/{id}` · `DELETE /api/nodes/{id}`
- `POST   /api/nodes/{id}/move` (between lanes, with optional `parentId` +
  `beforeId` for precise insertion — used by DnD)
- `POST   /api/nodes/{id}/indent` · `POST /api/nodes/{id}/outdent`
- `POST   /api/nodes/{id}/tags` · `DELETE /api/nodes/{id}/tags/{tagId}`
- `GET    /api/tags` · `POST /api/tags` · `DELETE /api/tags/{id}`
- `GET    /api/nodes/{id}/comments` · `POST /api/nodes/{id}/comments` ·
  `DELETE /api/comments/{id}`

Cards and lanes are ordered by [fractional indexing][fractional] sort keys,
so inserts and reorders never have to renumber siblings.

[fractional]: https://github.com/rocicorp/fractional-indexing

---

## Database

SQLite with WAL mode, foreign keys on. Three real tables (`lanes`, `nodes`,
`tags`) plus the `node_tags` join table and `comments`. See
[`server/db/schema.ts`](server/db/schema.ts).

Migrations are auto-applied on every server boot, so you only need to run
them by hand when developing schema changes:

```bash
bun run db:generate    # writes server/db/migrations/****.sql
bun run db:migrate     # applies them to DB_PATH (or ./outline-kanban.sqlite)
```

---

## Tests

End-to-end Playwright suites live under `scripts/e2e-*.ts`. Start the dev
server first, then run any of:

```bash
bun run dev &                              # background
bun run scripts/e2e-smoke.ts               # boot, render, no console errors
bun run scripts/e2e-card-focus.ts          # arrow nav, Enter to edit, modal open
bun run scripts/e2e-detail-modal.ts        # status, body, comments
bun run scripts/e2e-keymap.ts              # Tab cycle, M-Enter sibling, M-←/→
bun run scripts/e2e-lanes.ts               # add/rename/collapse/delete, DnD
bun run scripts/e2e-tab-focus.ts           # focus retention through indent
bun run scripts/e2e-tag-remove.ts          # #tag auto-attach / auto-detach
bun run scripts/e2e-initial-focus-and-nav.ts  # initial focus + +add nav
bun run scripts/e2e-dnd-indicator.ts       # drop indicator + precise insert
bun run scripts/e2e-pwa.ts                 # manifest, icons, SW registration
                                            # (run against the prod build)
```

`bun run typecheck` does both the server `tsc` and `vue-tsc` for the client.

---

## PWA / install

The app ships a `manifest.webmanifest`, a service worker, and icons (192 /
512 / 180 / maskable). On desktop Chrome / Edge you'll get an install
button in the address bar; on iOS Safari use *Share → Add to Home Screen*.

Service worker policy:

- `/api/*` and `/docs` always go to the network.
- Navigation requests: network-first, falling back to the cached app shell.
- Static assets: stale-while-revalidate.

Re-render the icons (e.g. after editing `client/public/icons/icon*.svg`):

```bash
bun run scripts/gen-icons.ts
```

It uses Playwright to rasterize the SVGs, so no extra image tooling needed.

---

## Design notes

- The card is the unit. There is *no* "todo bullet inside card" — if you
  need substructure, indent into a child card instead. That's the
  `org-mode` heading model.
- Lane = column = user-defined status. The `status` column on nodes still
  exists (used for `completed_at` and filtering) but the UI doesn't surface
  per-card status pills — the lane itself communicates that.
- Focus is the source of truth. Every important action (create, indent,
  move, save) ends by landing focus somewhere visible and emerald-rimmed.
- Drag-and-drop and keyboard moves converge on the same `/api/nodes/{id}/move`
  endpoint so the two interaction modes always stay in sync.

---

## License

MIT (see [LICENSE](LICENSE) if/when added — currently this is a personal
project).
