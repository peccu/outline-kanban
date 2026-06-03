// Seed a board with sample data for local preview / manual testing.
//
//   API_URL=http://localhost:9787 bun run scripts/seed-sample.ts
//
// Re-running deletes existing root cards first, so you always get the same
// known sample set. Lanes are left alone (the server seeds the defaults).
const API = process.env.API_URL ?? "http://localhost:9787";

async function jget(path: string) {
  return fetch(`${API}${path}`).then((r) => r.json());
}
async function jpost(path: string, body: unknown) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}
async function jpatch(path: string, body: unknown) {
  return fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

const lanes = (await jget("/api/lanes")) as any[];
if (lanes.length === 0) {
  console.error(
    "No lanes found — start the server first (it seeds default lanes on boot).",
  );
  process.exit(1);
}
const laneId = (name: string) => lanes.find((l) => l.name === name)?.id ?? lanes[0].id;

// Clean slate: delete all root cards (cascades to children/comments/tags).
const existing = (await jget("/api/nodes")) as any[];
for (const n of existing) {
  if (n.parentId === null) {
    await fetch(`${API}/api/nodes/${n.id}`, { method: "DELETE" });
  }
}

const node = (b: Record<string, unknown>) => jpost("/api/nodes", b);
const tag = (id: string, name: string) =>
  jpost(`/api/nodes/${id}/tags`, { name });
const comment = (id: string, bodyMd: string) =>
  jpost(`/api/nodes/${id}/comments`, { bodyMd });

// --- Inbox ---
const roadmap = await node({
  laneId: laneId("Inbox"),
  parentId: null,
  title: "Plan Q3 roadmap",
  bodyMd: "## Goals\n\n- Mobile polish\n- Faster sync\n- **Backup/restore** ✅",
});
await tag(roadmap.id, "planning");

// --- Today (with subtasks; one belongs to a different lane) ---
const blog = await node({
  laneId: laneId("Today"),
  parentId: null,
  title: "Write launch blog post",
});
await tag(blog.id, "writing");
await comment(blog.id, "Aim for ~800 words. Tone: friendly.");
const outline = await node({ parentId: blog.id, laneId: null, title: "Draft the outline" });
await comment(outline.id, "Use the org-mode angle.");
const image = await node({ parentId: blog.id, laneId: null, title: "Find header image" });
await jpatch(`/api/nodes/${image.id}`, { laneId: laneId("Doing") }); // subtask → lane chip

const review = await node({
  laneId: laneId("Today"),
  parentId: null,
  title: "Review PR #42",
});
await tag(review.id, "review");
await tag(review.id, "writing");

// --- Doing ---
const refactor = await node({
  laneId: laneId("Doing"),
  parentId: null,
  title: "Refactor auth module",
  bodyMd: "Split token logic into its own service.",
});
await tag(refactor.id, "backend");
await comment(refactor.id, "Watch out for the refresh-token edge case.");
await comment(refactor.id, "Done locally, needs review.");

// --- Done ---
const ship = await node({ laneId: laneId("Done"), parentId: null, title: "Ship v1.0" });
await tag(ship.id, "release");
await jpatch(`/api/nodes/${ship.id}`, { status: "done" });

const all = (await jget("/api/nodes")) as any[];
console.log(`Seeded ${all.length} nodes across ${lanes.length} lanes at ${API}`);
