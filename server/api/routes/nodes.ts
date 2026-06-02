import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { comments, nodeTags, nodes, tags } from "../../db/schema";
import {
  getNodeOrThrow,
  nodeSortKeyForInsert,
  previousSibling,
} from "../repo";
import {
  AttachTag,
  ErrorBody,
  IdParam,
  NodeCreate,
  NodeListQuery,
  NodeMove,
  NodeSchema,
  NodeUpdate,
  TagSchema,
  jsonContent,
} from "../schemas";

export const nodesRouter = new OpenAPIHono();

async function hydrateTags(
  rows: Array<typeof nodes.$inferSelect>,
): Promise<
  Array<
    typeof nodes.$inferSelect & {
      tags: (typeof tags.$inferSelect)[];
      commentCount: number;
    }
  >
> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const joined = await db
    .select({
      nodeId: nodeTags.nodeId,
      tag: tags,
    })
    .from(nodeTags)
    .innerJoin(tags, eq(nodeTags.tagId, tags.id))
    .where(inOrNothing(nodeTags.nodeId, ids));
  const byNode = new Map<string, (typeof tags.$inferSelect)[]>();
  for (const j of joined) {
    const arr = byNode.get(j.nodeId) ?? [];
    arr.push(j.tag);
    byNode.set(j.nodeId, arr);
  }
  // Comment counts so cards can show a 💬 badge without fetching each thread.
  const counts = await db
    .select({ nodeId: comments.nodeId, count: sql<number>`count(*)` })
    .from(comments)
    .where(inOrNothing(comments.nodeId, ids))
    .groupBy(comments.nodeId);
  const countByNode = new Map<string, number>();
  for (const c of counts) countByNode.set(c.nodeId, Number(c.count));
  return rows.map((r) => ({
    ...r,
    tags: byNode.get(r.id) ?? [],
    commentCount: countByNode.get(r.id) ?? 0,
  }));
}

import { inArray, sql } from "drizzle-orm";
function inOrNothing(col: any, ids: string[]) {
  if (ids.length === 0) return sql`0=1`;
  return inArray(col, ids);
}

nodesRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["nodes"],
    summary: "List nodes",
    request: { query: NodeListQuery },
    responses: {
      200: { description: "ok", content: jsonContent(z.array(NodeSchema)) },
    },
  }),
  async (c) => {
    const { laneId, parentId, status } = c.req.valid("query");
    const conds = [];
    if (laneId) conds.push(eq(nodes.laneId, laneId));
    if (parentId === "null") conds.push(isNull(nodes.parentId));
    else if (parentId) conds.push(eq(nodes.parentId, parentId));
    if (status) conds.push(eq(nodes.status, status));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await db
      .select()
      .from(nodes)
      .where(where)
      .orderBy(asc(nodes.sortKey));
    const hydrated = await hydrateTags(rows);
    return c.json(hydrated, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["nodes"],
    summary: "Get node",
    request: { params: IdParam },
    responses: {
      200: { description: "ok", content: jsonContent(NodeSchema) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const row = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
    if (!row[0]) return c.json({ error: "node not found" }, 404);
    const [hydrated] = await hydrateTags([row[0]]);
    return c.json(hydrated!, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["nodes"],
    summary: "Create node",
    request: { body: { content: jsonContent(NodeCreate), required: true } },
    responses: {
      201: { description: "created", content: jsonContent(NodeSchema) },
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const parentId = input.parentId ?? null;
    const laneId = input.laneId ?? null;
    const sortKey = await nodeSortKeyForInsert(
      parentId,
      laneId,
      input.beforeId ?? null,
    );
    const [row] = await db
      .insert(nodes)
      .values({
        parentId,
        laneId,
        sortKey,
        title: input.title ?? "",
        bodyMd: input.bodyMd ?? "",
        status: input.status ?? "open",
      })
      .returning();
    const [hydrated] = await hydrateTags([row!]);
    return c.json(hydrated!, 201);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["nodes"],
    summary: "Update node",
    request: {
      params: IdParam,
      body: { content: jsonContent(NodeUpdate), required: true },
    },
    responses: {
      200: { description: "ok", content: jsonContent(NodeSchema) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const next: Record<string, unknown> = { ...patch, updatedAt: new Date() };
    if (patch.status === "done") next.completedAt = new Date();
    if (patch.status && patch.status !== "done") next.completedAt = null;
    const [row] = await db
      .update(nodes)
      .set(next)
      .where(eq(nodes.id, id))
      .returning();
    if (!row) return c.json({ error: "node not found" }, 404);
    const [hydrated] = await hydrateTags([row]);
    return c.json(hydrated!, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["nodes"],
    summary: "Delete node (cascades to descendants)",
    request: { params: IdParam },
    responses: {
      204: { description: "deleted" },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const res = await db.delete(nodes).where(eq(nodes.id, id)).returning();
    if (!res[0]) return c.json({ error: "node not found" }, 404);
    return c.body(null, 204);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/move",
    tags: ["nodes"],
    summary: "Move node to new parent/lane and position",
    request: {
      params: IdParam,
      body: { content: jsonContent(NodeMove), required: true },
    },
    responses: {
      200: { description: "ok", content: jsonContent(NodeSchema) },
      400: { description: "invalid move", content: jsonContent(ErrorBody) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { parentId, laneId, beforeId } = c.req.valid("json");
    if (parentId === id)
      return c.json({ error: "cannot move node under itself" }, 400);
    try {
      const sortKey = await nodeSortKeyForInsert(
        parentId,
        laneId,
        beforeId ?? null,
        id,
      );
      const [row] = await db
        .update(nodes)
        .set({ parentId, laneId, sortKey, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .returning();
      if (!row) return c.json({ error: "node not found" }, 404);
      const [hydrated] = await hydrateTags([row]);
      return c.json(hydrated!, 200);
    } catch (e) {
      return c.json({ error: "move failed", detail: String(e) }, 400);
    }
  },
);

nodesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/indent",
    tags: ["nodes"],
    summary: "Tab: move under previous sibling",
    request: { params: IdParam },
    responses: {
      200: { description: "ok", content: jsonContent(NodeSchema) },
      400: { description: "no previous sibling", content: jsonContent(ErrorBody) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const me = await getNodeOrThrow(id).catch(() => null);
    if (!me) return c.json({ error: "node not found" }, 404);
    const prev = await previousSibling(id);
    if (!prev) return c.json({ error: "no previous sibling to indent into" }, 400);
    const sortKey = await nodeSortKeyForInsert(prev.id, null, null, id);
    const [row] = await db
      .update(nodes)
      .set({ parentId: prev.id, laneId: null, sortKey, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning();
    const [hydrated] = await hydrateTags([row!]);
    return c.json(hydrated!, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/outdent",
    tags: ["nodes"],
    summary: "Shift+Tab: move out one level",
    request: { params: IdParam },
    responses: {
      200: { description: "ok", content: jsonContent(NodeSchema) },
      400: { description: "already top-level", content: jsonContent(ErrorBody) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const me = await getNodeOrThrow(id).catch(() => null);
    if (!me) return c.json({ error: "node not found" }, 404);
    if (me.parentId === null)
      return c.json({ error: "node is already top-level" }, 400);
    const parent = await getNodeOrThrow(me.parentId);
    const sortKey = await nodeSortKeyForInsert(
      parent.parentId,
      parent.laneId,
      null,
      id,
    );
    const [row] = await db
      .update(nodes)
      .set({
        parentId: parent.parentId,
        laneId: parent.parentId === null ? parent.laneId : null,
        sortKey,
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, id))
      .returning();
    const [hydrated] = await hydrateTags([row!]);
    return c.json(hydrated!, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/tags",
    tags: ["nodes"],
    summary: "Attach a tag (by id or name; creates tag if name+missing)",
    request: {
      params: IdParam,
      body: { content: jsonContent(AttachTag), required: true },
    },
    responses: {
      200: { description: "ok", content: jsonContent(TagSchema) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const node = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    if (!node[0]) return c.json({ error: "node not found" }, 404);

    let tag: typeof tags.$inferSelect | undefined;
    if (input.tagId) {
      const t = await db
        .select()
        .from(tags)
        .where(eq(tags.id, input.tagId))
        .limit(1);
      tag = t[0];
    } else if (input.name) {
      const existing = await db
        .select()
        .from(tags)
        .where(eq(tags.name, input.name))
        .limit(1);
      if (existing[0]) tag = existing[0];
      else {
        const [created] = await db
          .insert(tags)
          .values({ name: input.name })
          .returning();
        tag = created;
      }
    }
    if (!tag) return c.json({ error: "tag not found" }, 404);

    await db
      .insert(nodeTags)
      .values({ nodeId: id, tagId: tag.id })
      .onConflictDoNothing();
    return c.json(tag, 200);
  },
);

nodesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}/tags/{tagId}",
    tags: ["nodes"],
    summary: "Detach a tag",
    request: {
      params: z.object({
        id: z.string().openapi({ param: { name: "id", in: "path" } }),
        tagId: z.string().openapi({ param: { name: "tagId", in: "path" } }),
      }),
    },
    responses: {
      204: { description: "detached" },
    },
  }),
  async (c) => {
    const { id, tagId } = c.req.valid("param");
    await db
      .delete(nodeTags)
      .where(and(eq(nodeTags.nodeId, id), eq(nodeTags.tagId, tagId))!);
    return c.body(null, 204);
  },
);
