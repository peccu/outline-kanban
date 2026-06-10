# outline-kanban — Claude Code guide

## Port layout

| Port | Purpose | DB |
|------|---------|-----|
| **8787** | Docker container (production data, `docker-compose up`) | Docker volume `outline-kanban-data` |
| **9787 / 9788** | `bun run dev` — local dev with hot-reload | `outline-kanban-dev.sqlite` |
| **9787 / 9788** | `./dev.sh` / `bun run preview` — production-like preview | `outline-kanban-preview.sqlite` |

**Never start the dev server on port 8787.** That port belongs to the Docker container and changing it loses access to production data.

`bun run dev` and `./dev.sh` share the same ports (9787/9788) so they can't run at the same time — that's fine because they serve different purposes.

## Starting the dev server

```sh
bun run dev          # API on :9787, Vite on :9788, DB = outline-kanban-dev.sqlite
```

Open **http://localhost:9788** to test changes. The container at http://localhost:8787 is unaffected.

## DB migrations

After editing `server/db/schema.ts`, regenerate and apply:

```sh
bun run db:generate  # creates a new SQL migration in server/db/migrations/
bun run db:migrate   # applies to outline-kanban-dev.sqlite (default DB_PATH)
```

To apply to the Docker container's DB instead:

```sh
DB_PATH=/path/to/volume/outline-kanban.sqlite bun run db:migrate
# or: docker exec outline-kanban bun run server/db/migrate.ts
```

### Checklist when adding a column to an existing table

Forgetting any of these causes silent data loss or runtime errors:

- [ ] `server/db/schema.ts` — add the column with a default value
- [ ] `bun run db:generate` — generates the migration SQL
- [ ] `server/api/schemas.ts` — add the field to the relevant Zod schema(s) (e.g. `LaneSchema`, `LaneUpdate`)
- [ ] `server/api/routes/backup.ts` — **two places**:
  - INSERT statement: add the new column name
  - `ins.<table>.run(...)` call: pass `row.newField ?? <default>` (the `?? default` keeps old backups importable)
  - Bump `BACKUP_VERSION` by 1
- [ ] Any frontend type that references the table (auto-generated via `bun run gen:types` after the server is updated)

## Tech stack

- **Backend**: Bun + Hono + Drizzle ORM + SQLite (WAL mode)
- **Frontend**: Vue 3 + Vite + TailwindCSS v4 + TanStack Vue Query
- **API schema**: `@hono/zod-openapi` → `client/src/api/schema.gen.ts` (auto-generated)

## Regenerating the API client types

```sh
bun run gen:types    # requires the dev server to be running on :9787
```
