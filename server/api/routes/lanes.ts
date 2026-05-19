import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { lanes } from "../../db/schema";
import { laneSortKeyForInsert } from "../repo";
import {
  ErrorBody,
  IdParam,
  LaneCreate,
  LaneReorder,
  LaneSchema,
  LaneUpdate,
  jsonContent,
} from "../schemas";

export const lanesRouter = new OpenAPIHono();

lanesRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["lanes"],
    summary: "List lanes",
    responses: {
      200: { description: "ok", content: jsonContent(z.array(LaneSchema)) },
    },
  }),
  async (c) => {
    const rows = await db.select().from(lanes).orderBy(asc(lanes.sortKey));
    return c.json(rows, 200);
  },
);

lanesRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["lanes"],
    summary: "Create lane",
    request: { body: { content: jsonContent(LaneCreate), required: true } },
    responses: {
      201: { description: "created", content: jsonContent(LaneSchema) },
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const sortKey = await laneSortKeyForInsert(input.beforeLaneId ?? null);
    const [row] = await db
      .insert(lanes)
      .values({
        name: input.name,
        color: input.color ?? null,
        sortKey,
      })
      .returning();
    return c.json(row!, 201);
  },
);

lanesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["lanes"],
    summary: "Update lane",
    request: {
      params: IdParam,
      body: { content: jsonContent(LaneUpdate), required: true },
    },
    responses: {
      200: { description: "ok", content: jsonContent(LaneSchema) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const [row] = await db
      .update(lanes)
      .set(patch)
      .where(eq(lanes.id, id))
      .returning();
    if (!row) return c.json({ error: "lane not found" }, 404);
    return c.json(row, 200);
  },
);

lanesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/reorder",
    tags: ["lanes"],
    summary: "Reorder lane",
    request: {
      params: IdParam,
      body: { content: jsonContent(LaneReorder), required: true },
    },
    responses: {
      200: { description: "ok", content: jsonContent(LaneSchema) },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { beforeLaneId } = c.req.valid("json");
    const exists = await db
      .select({ id: lanes.id })
      .from(lanes)
      .where(eq(lanes.id, id))
      .limit(1);
    if (!exists[0]) return c.json({ error: "lane not found" }, 404);
    const sortKey = await laneSortKeyForInsert(beforeLaneId);
    const [row] = await db
      .update(lanes)
      .set({ sortKey })
      .where(eq(lanes.id, id))
      .returning();
    return c.json(row!, 200);
  },
);

lanesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["lanes"],
    summary: "Delete lane",
    request: { params: IdParam },
    responses: {
      204: { description: "deleted" },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const res = await db.delete(lanes).where(eq(lanes.id, id)).returning();
    if (!res[0]) return c.json({ error: "lane not found" }, 404);
    return c.body(null, 204);
  },
);
