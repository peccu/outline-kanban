// T1: back up the board to a ZIP and restore it (data + attachments).
import { strFromU8, unzipSync } from "fflate";

const API_URL = process.env.API_URL ?? "http://localhost:8787";

const failures: string[] = [];
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(label);
}

async function resetData() {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of all) {
    if (n.parentId === null) {
      await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
    }
  }
}
await resetData();

const lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
const today = lanes.find((l) => l.name === "Today") ?? lanes[0];

// Seed: a card with a tag, a comment, and an uploaded attachment.
const TITLE = "backup card " + Date.now().toString(36);
const node = await fetch(`${API_URL}/api/nodes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ laneId: today.id, parentId: null, title: TITLE }),
}).then((r) => r.json());
await fetch(`${API_URL}/api/nodes/${node.id}/tags`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "backuptag" }),
});
await fetch(`${API_URL}/api/nodes/${node.id}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ bodyMd: "a backed-up comment" }),
});
const upForm = new FormData();
upForm.append("file", new File(["hello-bytes"], "note.txt", { type: "text/plain" }));
const attachment = await fetch(`${API_URL}/api/attachments`, {
  method: "POST",
  body: upForm,
}).then((r) => r.json());

// Download the backup ZIP and inspect it.
const zipRes = await fetch(`${API_URL}/api/backup`);
check("backup responds with zip", zipRes.headers.get("content-type") === "application/zip");
const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
const entries = unzipSync(zipBytes);
check("archive has data.json", !!entries["data.json"]);
const data = JSON.parse(strFromU8(entries["data.json"]!));
check("backup contains the card", (data.nodes ?? []).some((n: any) => n.title === TITLE));
check("backup contains the comment", (data.comments ?? []).some((c: any) => c.bodyMd === "a backed-up comment"));
check("backup contains attachment metadata", (data.attachments ?? []).some((a: any) => a.id === attachment.id));
check("backup contains attachment blob", !!entries[`attachments/${attachment.id}`]);

// Mutate: delete the card so the DB no longer has it.
await fetch(`${API_URL}/api/nodes/${node.id}`, { method: "DELETE" });
let after = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
check("card removed before restore", !after.some((n) => n.title === TITLE));

// Restore from the ZIP.
const restoreForm = new FormData();
restoreForm.append("file", new File([zipBytes], "backup.zip", { type: "application/zip" }));
const restoreRes = await fetch(`${API_URL}/api/restore`, { method: "POST", body: restoreForm });
check("restore responds ok", restoreRes.ok);
const summary = await restoreRes.json().catch(() => ({}));
console.log("restore summary:", JSON.stringify(summary));

// Verify the card, comment, tag and attachment are back.
after = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const restored = after.find((n) => n.title === TITLE);
check("card restored", !!restored);
check("tag restored on card", (restored?.tags ?? []).some((t: any) => t.name === "backuptag"));
if (restored) {
  const cs = (await fetch(`${API_URL}/api/nodes/${restored.id}/comments`).then((r) => r.json())) as any[];
  check("comment restored", cs.some((c) => c.bodyMd === "a backed-up comment"));
}
const blobRes = await fetch(`${API_URL}/api/attachments/${attachment.id}`);
check("attachment blob restored & served", blobRes.ok);
check("attachment bytes intact", (await blobRes.text()) === "hello-bytes");

const ok = failures.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
process.exit(ok ? 0 : 1);
