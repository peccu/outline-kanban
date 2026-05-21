import { z } from "@hono/zod-openapi";
import { NODE_STATUSES } from "../db/schema";

export const NodeStatusSchema = z.enum(NODE_STATUSES).openapi("NodeStatus");

export const IdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const LaneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    sortKey: z.string(),
    createdAt: z.coerce.date(),
  })
  .openapi("Lane");

export const LaneCreate = z
  .object({
    name: z.string().min(1).max(120),
    color: z.string().max(32).nullable().optional(),
    beforeLaneId: z.string().nullable().optional(),
  })
  .openapi("LaneCreate");

export const LaneUpdate = z
  .object({
    name: z.string().min(1).max(120).optional(),
    color: z.string().max(32).nullable().optional(),
  })
  .openapi("LaneUpdate");

export const LaneReorder = z
  .object({
    beforeLaneId: z.string().nullable(),
  })
  .openapi("LaneReorder");

export const TagSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: z.coerce.date(),
  })
  .openapi("Tag");

export const TagCreate = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[^\s#]+$/, "tag name must not contain whitespace or '#'"),
    color: z.string().max(32).nullable().optional(),
  })
  .openapi("TagCreate");

export const TagUpdate = z
  .object({
    color: z.string().max(32).nullable().optional(),
  })
  .openapi("TagUpdate");

export const NodeSchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    laneId: z.string().nullable(),
    sortKey: z.string(),
    title: z.string(),
    bodyMd: z.string(),
    status: NodeStatusSchema,
    completedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    tags: z.array(TagSchema).optional(),
  })
  .openapi("Node");

export const NodeCreate = z
  .object({
    parentId: z.string().nullable().optional(),
    laneId: z.string().nullable().optional(),
    title: z.string().max(2000).optional(),
    bodyMd: z.string().optional(),
    status: NodeStatusSchema.optional(),
    beforeId: z
      .string()
      .nullable()
      .optional()
      .describe("If set, insert before this sibling. Null/omitted = append."),
  })
  .openapi("NodeCreate");

export const NodeUpdate = z
  .object({
    title: z.string().max(2000).optional(),
    bodyMd: z.string().optional(),
    status: NodeStatusSchema.optional(),
  })
  .openapi("NodeUpdate");

export const NodeMove = z
  .object({
    parentId: z.string().nullable(),
    laneId: z.string().nullable(),
    beforeId: z.string().nullable().optional(),
  })
  .openapi("NodeMove");

export const NodeListQuery = z
  .object({
    laneId: z.string().optional(),
    parentId: z
      .string()
      .optional()
      .describe("Filter by parent id. Pass 'null' for top-level."),
    status: NodeStatusSchema.optional(),
  })
  .openapi("NodeListQuery");

export const CommentSchema = z
  .object({
    id: z.string(),
    nodeId: z.string(),
    bodyMd: z.string(),
    createdAt: z.coerce.date(),
  })
  .openapi("Comment");

export const CommentCreate = z
  .object({
    bodyMd: z.string().min(1).max(10_000),
  })
  .openapi("CommentCreate");

export const CommentUpdate = z
  .object({
    bodyMd: z.string().min(1).max(10_000),
  })
  .openapi("CommentUpdate");

export const AttachTag = z
  .object({
    tagId: z.string().optional(),
    name: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.tagId || v.name, "tagId or name is required")
  .openapi("AttachTag");

export const ErrorBody = z
  .object({
    error: z.string(),
    detail: z.string().optional(),
  })
  .openapi("Error");

export const jsonContent = <S extends z.ZodTypeAny>(schema: S) => ({
  "application/json": { schema },
});

export const AttachmentSchema = z
  .object({
    id: z.string(),
    filename: z.string(),
    mime: z.string(),
    size: z.number().int().nonnegative(),
    url: z.string(),
    createdAt: z.coerce.date(),
  })
  .openapi("Attachment");
