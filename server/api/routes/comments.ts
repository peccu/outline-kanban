import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { comments, nodes } from "../../db/schema";
import {
  CommentCreate,
  CommentSchema,
  ErrorBody,
  IdParam,
  jsonContent,
} from "../schemas";

export const commentsRouter = new OpenAPIHono();

commentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/nodes/{id}/comments",
    tags: ["comments"],
    summary: "List comments for a node",
    request: { params: IdParam },
    responses: {
      200: { description: "ok", content: jsonContent(z.array(CommentSchema)) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.nodeId, id))
      .orderBy(asc(comments.createdAt));
    return c.json(rows, 200);
  },
);

commentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/nodes/{id}/comments",
    tags: ["comments"],
    summary: "Add a comment",
    request: {
      params: IdParam,
      body: { content: jsonContent(CommentCreate), required: true },
    },
    responses: {
      201: { description: "created", content: jsonContent(CommentSchema) },
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
    const [row] = await db
      .insert(comments)
      .values({ nodeId: id, bodyMd: input.bodyMd })
      .returning();
    return c.json(row!, 201);
  },
);

commentsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/comments/{id}",
    tags: ["comments"],
    summary: "Delete a comment",
    request: { params: IdParam },
    responses: {
      204: { description: "deleted" },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const res = await db.delete(comments).where(eq(comments.id, id)).returning();
    if (!res[0]) return c.json({ error: "comment not found" }, 404);
    return c.body(null, 204);
  },
);
