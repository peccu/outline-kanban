// Backup / restore the whole board as a single ZIP:
//   data.json            — all rows (lanes, nodes, tags, node_tags, comments,
//                          attachments metadata)
//   attachments/<id>     — the raw bytes of each uploaded file
//
// Restore wipes the current data and replaces it with the archive's contents
// (a full, not incremental, import).
import { Hono } from "hono";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { sqlite } from "../../db/client";
import { db } from "../../db/client";
import {
  attachments,
  comments,
  lanes,
  nodeTags,
  nodes,
  tags,
} from "../../db/schema";
import { log } from "../../lib/log";

const ATTACHMENTS_DIR = resolve(process.env.ATTACHMENTS_DIR ?? "./attachments");

export const backupRouter = new Hono();

const BACKUP_VERSION = 1;

backupRouter.get("/backup", async (c) => {
  const [laneRows, nodeRows, tagRows, nodeTagRows, commentRows, attachmentRows] =
    await Promise.all([
      db.select().from(lanes),
      db.select().from(nodes),
      db.select().from(tags),
      db.select().from(nodeTags),
      db.select().from(comments),
      db.select().from(attachments),
    ]);

  const data = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    lanes: laneRows,
    nodes: nodeRows,
    tags: tagRows,
    nodeTags: nodeTagRows,
    comments: commentRows,
    attachments: attachmentRows,
  };

  const files: Record<string, Uint8Array> = {
    "data.json": strToU8(JSON.stringify(data, null, 2)),
  };
  for (const a of attachmentRows) {
    const path = join(ATTACHMENTS_DIR, a.id);
    if (existsSync(path)) {
      files[`attachments/${a.id}`] = new Uint8Array(
        await Bun.file(path).arrayBuffer(),
      );
    }
  }

  const zipped = zipSync(files, { level: 6 });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(zipped, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="outline-kanban-backup-${stamp}.zip"`,
      "content-length": String(zipped.byteLength),
    },
  });
});

function toMs(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
function toMsOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return toMs(v);
}

backupRouter.post("/restore", async (c) => {
  let zipBytes: Uint8Array;
  const ct = c.req.header("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return c.json({ error: "missing 'file' field" }, 400);
      }
      zipBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      zipBytes = new Uint8Array(await c.req.arrayBuffer());
    }
  } catch (e) {
    return c.json({ error: "could not read upload", detail: String(e) }, 400);
  }

  let data: any;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
    const json = entries["data.json"];
    if (!json) throw new Error("archive missing data.json");
    data = JSON.parse(strFromU8(json));
  } catch (e) {
    return c.json({ error: "invalid backup archive", detail: String(e) }, 400);
  }
  if (typeof data?.version !== "number") {
    return c.json({ error: "unrecognized backup format" }, 400);
  }

  const ins = {
    lane: sqlite.prepare(
      "INSERT INTO lanes (id,name,color,sort_key,created_at) VALUES (?,?,?,?,?)",
    ),
    tag: sqlite.prepare(
      "INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)",
    ),
    node: sqlite.prepare(
      "INSERT INTO nodes (id,parent_id,lane_id,sort_key,title,body_md,status,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ),
    nodeTag: sqlite.prepare(
      "INSERT INTO node_tags (node_id,tag_id) VALUES (?,?)",
    ),
    comment: sqlite.prepare(
      "INSERT INTO comments (id,node_id,body_md,created_at) VALUES (?,?,?,?)",
    ),
    attachment: sqlite.prepare(
      "INSERT INTO attachments (id,filename,mime,size,created_at) VALUES (?,?,?,?,?)",
    ),
  };

  const apply = sqlite.transaction(() => {
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec(
      "DELETE FROM comments; DELETE FROM node_tags; DELETE FROM attachments; DELETE FROM nodes; DELETE FROM tags; DELETE FROM lanes;",
    );
    for (const l of data.lanes ?? [])
      ins.lane.run(l.id, l.name, l.color ?? null, l.sortKey, toMs(l.createdAt));
    for (const t of data.tags ?? [])
      ins.tag.run(t.id, t.name, t.color ?? null, toMs(t.createdAt));
    for (const n of data.nodes ?? [])
      ins.node.run(
        n.id,
        n.parentId ?? null,
        n.laneId ?? null,
        n.sortKey,
        n.title ?? "",
        n.bodyMd ?? "",
        n.status ?? "open",
        toMsOrNull(n.completedAt),
        toMs(n.createdAt),
        toMs(n.updatedAt),
      );
    for (const nt of data.nodeTags ?? [])
      ins.nodeTag.run(nt.nodeId, nt.tagId);
    for (const cm of data.comments ?? [])
      ins.comment.run(cm.id, cm.nodeId, cm.bodyMd ?? "", toMs(cm.createdAt));
    for (const a of data.attachments ?? [])
      ins.attachment.run(a.id, a.filename, a.mime, a.size, toMs(a.createdAt));
    sqlite.exec("PRAGMA foreign_keys = ON");
  });

  try {
    apply();
  } catch (e) {
    log.error(`[restore] failed: ${String(e)}`);
    return c.json({ error: "restore failed", detail: String(e) }, 400);
  }

  // Write attachment blobs back to disk.
  if (!existsSync(ATTACHMENTS_DIR)) {
    mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }
  let restoredBlobs = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith("attachments/")) continue;
    const id = name.slice("attachments/".length);
    if (!/^[0-9a-f-]{20,}$/i.test(id)) continue;
    await Bun.write(join(ATTACHMENTS_DIR, id), bytes);
    restoredBlobs++;
  }

  return c.json({
    ok: true,
    lanes: (data.lanes ?? []).length,
    nodes: (data.nodes ?? []).length,
    tags: (data.tags ?? []).length,
    comments: (data.comments ?? []).length,
    attachments: (data.attachments ?? []).length,
    restoredBlobs,
  });
});
