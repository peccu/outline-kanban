// Upload + serve user-attached files (clipboard screenshots, dropped
// images, dropped PDFs, …) used in description / comment Markdown.
//
// Files are stored on disk under ATTACHMENTS_DIR (defaults to ./attachments,
// /data/attachments inside the Docker image). The DB row keeps the
// original filename, mime, and size; the blob filename on disk is the
// row's uuid.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "../../db/client";
import { attachments } from "../../db/schema";
import { log } from "../../lib/log";
import { AttachmentSchema, ErrorBody, IdParam, jsonContent } from "../schemas";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const ATTACHMENTS_DIR = resolve(
  process.env.ATTACHMENTS_DIR ?? "./attachments",
);
if (!existsSync(ATTACHMENTS_DIR)) {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  log.info(`[attachments] created storage dir ${ATTACHMENTS_DIR}`);
}

function safePath(id: string): string {
  // ids are UUIDv4 — but guard anyway against path traversal.
  if (!/^[0-9a-f-]{20,}$/i.test(id)) throw new Error("invalid attachment id");
  return join(ATTACHMENTS_DIR, id);
}

// Strip path separators / control bytes from filenames before echoing
// them back in Content-Disposition.
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\/\\]+/g, "_")
    .slice(0, 200) || "attachment";
}

export const attachmentsRouter = new OpenAPIHono();

attachmentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/attachments",
    tags: ["attachments"],
    summary: "Upload an attachment",
    request: {
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z
                .any()
                .openapi({ type: "string", format: "binary" })
                .describe("The uploaded file"),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "created", content: jsonContent(AttachmentSchema) },
      400: { description: "bad request", content: jsonContent(ErrorBody) },
      413: { description: "too large", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "missing or invalid 'file' field" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json(
        { error: `file too large (max ${MAX_BYTES} bytes)` },
        413,
      );
    }

    const id = crypto.randomUUID();
    const mime = file.type || "application/octet-stream";
    const filename = sanitizeFilename(file.name || "attachment");
    const bytes = new Uint8Array(await file.arrayBuffer());

    await Bun.write(safePath(id), bytes);

    const [row] = await db
      .insert(attachments)
      .values({ id, filename, mime, size: file.size })
      .returning();
    if (!row) {
      return c.json({ error: "failed to record attachment" }, 400);
    }

    return c.json(
      {
        ...row,
        createdAt: new Date(row.createdAt),
        url: `/api/attachments/${row.id}`,
      },
      201,
    );
  },
);

attachmentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/attachments/{id}",
    tags: ["attachments"],
    summary: "Fetch an attachment's raw bytes",
    request: { params: IdParam },
    responses: {
      200: {
        description: "ok",
        content: { "application/octet-stream": { schema: z.string() } },
      },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!row) return c.json({ error: "attachment not found" }, 404);

    const path = safePath(id);
    if (!existsSync(path)) {
      log.warn(`[attachments] db row ${id} exists but file is missing`);
      return c.json({ error: "attachment file missing" }, 404);
    }
    const file = Bun.file(path);
    return new Response(file, {
      headers: {
        "content-type": row.mime,
        "content-length": String(row.size),
        // inline so browsers render images/PDFs in place; the filename hint
        // is still honored on explicit downloads.
        "content-disposition": `inline; filename="${row.filename}"`,
        // Once a blob exists it never changes — let intermediaries cache it.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  },
);
