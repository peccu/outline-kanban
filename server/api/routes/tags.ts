import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { tags } from "../../db/schema";
import {
  ErrorBody,
  IdParam,
  TagCreate,
  TagSchema,
  jsonContent,
} from "../schemas";

export const tagsRouter = new OpenAPIHono();

tagsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["tags"],
    summary: "List tags",
    responses: {
      200: { description: "ok", content: jsonContent(z.array(TagSchema)) },
    },
  }),
  async (c) => {
    const rows = await db.select().from(tags).orderBy(asc(tags.name));
    return c.json(rows, 200);
  },
);

tagsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["tags"],
    summary: "Create tag (idempotent on name)",
    request: { body: { content: jsonContent(TagCreate), required: true } },
    responses: {
      200: { description: "existing", content: jsonContent(TagSchema) },
      201: { description: "created", content: jsonContent(TagSchema) },
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const existing = await db
      .select()
      .from(tags)
      .where(eq(tags.name, input.name))
      .limit(1);
    if (existing[0]) return c.json(existing[0], 200);
    const [row] = await db
      .insert(tags)
      .values({ name: input.name, color: input.color ?? null })
      .returning();
    return c.json(row!, 201);
  },
);

tagsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["tags"],
    summary: "Delete tag (detaches from all nodes)",
    request: { params: IdParam },
    responses: {
      204: { description: "deleted" },
      404: { description: "not found", content: jsonContent(ErrorBody) },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const res = await db.delete(tags).where(eq(tags.id, id)).returning();
    if (!res[0]) return c.json({ error: "tag not found" }, 404);
    return c.body(null, 204);
  },
);
