import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { lanes, nodes } from "../db/schema";
import { keyAfter, keyBefore, keyBetween } from "../lib/sort-key";

export async function laneSortKeyForInsert(
  beforeLaneId: string | null,
): Promise<string> {
  if (beforeLaneId === null) {
    const last = await db
      .select({ sortKey: lanes.sortKey })
      .from(lanes)
      .orderBy(desc(lanes.sortKey))
      .limit(1);
    return keyAfter(last[0]?.sortKey ?? null);
  }
  const target = await db
    .select({ sortKey: lanes.sortKey })
    .from(lanes)
    .where(eq(lanes.id, beforeLaneId))
    .limit(1);
  if (!target[0]) throw new Error(`lane not found: ${beforeLaneId}`);
  const prev = await db
    .select({ sortKey: lanes.sortKey })
    .from(lanes)
    .where(sql`${lanes.sortKey} < ${target[0].sortKey}`)
    .orderBy(desc(lanes.sortKey))
    .limit(1);
  return keyBetween(prev[0]?.sortKey ?? null, target[0].sortKey);
}

function siblingWhere(parentId: string | null, laneId: string | null) {
  const parentCond =
    parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId);
  if (parentId !== null) return parentCond;
  return laneId === null
    ? and(parentCond, isNull(nodes.laneId))!
    : and(parentCond, eq(nodes.laneId, laneId))!;
}

export async function nodeSortKeyForInsert(
  parentId: string | null,
  laneId: string | null,
  beforeId: string | null,
  excludeNodeId?: string,
): Promise<string> {
  if (beforeId === null) {
    const where = siblingWhere(parentId, laneId);
    const finalWhere = excludeNodeId
      ? and(where, sql`${nodes.id} <> ${excludeNodeId}`)!
      : where;
    const last = await db
      .select({ sortKey: nodes.sortKey })
      .from(nodes)
      .where(finalWhere)
      .orderBy(desc(nodes.sortKey))
      .limit(1);
    return keyAfter(last[0]?.sortKey ?? null);
  }

  const target = await db
    .select({ sortKey: nodes.sortKey })
    .from(nodes)
    .where(eq(nodes.id, beforeId))
    .limit(1);
  if (!target[0]) throw new Error(`node not found: ${beforeId}`);

  const siblings = siblingWhere(parentId, laneId);
  const prevWhere = excludeNodeId
    ? and(
        siblings,
        sql`${nodes.sortKey} < ${target[0].sortKey}`,
        sql`${nodes.id} <> ${excludeNodeId}`,
      )!
    : and(siblings, sql`${nodes.sortKey} < ${target[0].sortKey}`)!;
  const prev = await db
    .select({ sortKey: nodes.sortKey })
    .from(nodes)
    .where(prevWhere)
    .orderBy(desc(nodes.sortKey))
    .limit(1);
  return keyBetween(prev[0]?.sortKey ?? null, target[0].sortKey);
}

export async function siblingsOf(
  parentId: string | null,
  laneId: string | null,
) {
  return db
    .select()
    .from(nodes)
    .where(siblingWhere(parentId, laneId))
    .orderBy(asc(nodes.sortKey));
}

export async function previousSibling(nodeId: string) {
  const me = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!me[0]) return null;
  const prev = await db
    .select()
    .from(nodes)
    .where(
      and(
        me[0].parentId === null
          ? isNull(nodes.parentId)
          : eq(nodes.parentId, me[0].parentId),
        me[0].parentId === null
          ? me[0].laneId === null
            ? isNull(nodes.laneId)
            : eq(nodes.laneId, me[0].laneId)
          : sql`1=1`,
        sql`${nodes.sortKey} < ${me[0].sortKey}`,
      )!,
    )
    .orderBy(desc(nodes.sortKey))
    .limit(1);
  return prev[0] ?? null;
}

export async function getNodeOrThrow(id: string) {
  const row = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
  if (!row[0]) throw new Error(`node not found: ${id}`);
  return row[0];
}
