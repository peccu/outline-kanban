import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const NODE_STATUSES = ["open", "doing", "done", "blocked"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const lanes = sqliteTable(
  "lanes",
  {
    id: id(),
    name: text("name").notNull(),
    color: text("color"),
    sortKey: text("sort_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    sortKeyIdx: index("lanes_sort_key_idx").on(t.sortKey),
  }),
);

export const nodes = sqliteTable(
  "nodes",
  {
    id: id(),
    parentId: text("parent_id").references((): any => nodes.id, {
      onDelete: "cascade",
    }),
    laneId: text("lane_id").references(() => lanes.id, {
      onDelete: "set null",
    }),
    sortKey: text("sort_key").notNull(),
    title: text("title").notNull().default(""),
    bodyMd: text("body_md").notNull().default(""),
    status: text("status", { enum: NODE_STATUSES }).notNull().default("open"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    parentIdx: index("nodes_parent_idx").on(t.parentId),
    laneIdx: index("nodes_lane_idx").on(t.laneId),
    sortKeyIdx: index("nodes_sort_key_idx").on(t.sortKey),
    statusIdx: index("nodes_status_idx").on(t.status),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: id(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => ({
    nameIdx: uniqueIndex("tags_name_unique").on(t.name),
  }),
);

export const nodeTags = sqliteTable(
  "node_tags",
  {
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.nodeId, t.tagId] }),
    tagIdx: index("node_tags_tag_idx").on(t.tagId),
  }),
);

export const comments = sqliteTable(
  "comments",
  {
    id: id(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    bodyMd: text("body_md").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    nodeIdx: index("comments_node_idx").on(t.nodeId),
  }),
);

// Uploaded files (images pasted from the clipboard or dropped onto a
// description / comment textarea). The blob lives on disk under
// ATTACHMENTS_DIR/<id>; this row holds the metadata.
export const attachments = sqliteTable("attachments", {
  id: id(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
});

export const lanesRelations = relations(lanes, ({ many }) => ({
  nodes: many(nodes),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  parent: one(nodes, {
    fields: [nodes.parentId],
    references: [nodes.id],
    relationName: "parent",
  }),
  children: many(nodes, { relationName: "parent" }),
  lane: one(lanes, { fields: [nodes.laneId], references: [lanes.id] }),
  tags: many(nodeTags),
  comments: many(comments),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  nodes: many(nodeTags),
}));

export const nodeTagsRelations = relations(nodeTags, ({ one }) => ({
  node: one(nodes, { fields: [nodeTags.nodeId], references: [nodes.id] }),
  tag: one(tags, { fields: [nodeTags.tagId], references: [tags.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  node: one(nodes, { fields: [comments.nodeId], references: [nodes.id] }),
}));
