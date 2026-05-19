import { db } from "./client";
import { lanes } from "./schema";
import { nKeysBetween } from "../lib/sort-key";

export async function seedDefaultLanesIfEmpty(): Promise<void> {
  const existing = await db.select({ id: lanes.id }).from(lanes).limit(1);
  if (existing.length > 0) return;
  const keys = nKeysBetween(null, null, 4);
  await db.insert(lanes).values([
    { name: "Inbox", sortKey: keys[0]!, color: "#6b7280" },
    { name: "Today", sortKey: keys[1]!, color: "#f59e0b" },
    { name: "Doing", sortKey: keys[2]!, color: "#3b82f6" },
    { name: "Done", sortKey: keys[3]!, color: "#10b981" },
  ]);
  console.log("[db] seeded default lanes");
}
