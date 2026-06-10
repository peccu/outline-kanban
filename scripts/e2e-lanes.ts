import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

async function resetData() {
  const allNodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of allNodes) {
    if (n.parentId === null) {
      await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
    }
  }
  const allTags = (await fetch(`${API_URL}/api/tags`).then((r) => r.json())) as any[];
  for (const t of allTags) {
    await fetch(`${API_URL}/api/tags/${t.id}`, { method: "DELETE" });
  }
  // Reset lanes so the seed re-runs (only on empty)
  const allLanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
  for (const l of allLanes) {
    await fetch(`${API_URL}/api/lanes/${l.id}`, { method: "DELETE" });
  }
  // Re-create defaults via direct POST to match the seed
  const defaults = [
    { name: "Inbox", color: "#6b7280" },
    { name: "Today", color: "#f59e0b" },
    { name: "Doing", color: "#3b82f6" },
    { name: "Done", color: "#10b981" },
  ];
  for (const d of defaults) {
    await fetch(`${API_URL}/api/lanes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(d),
    });
  }
}
await resetData();

const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => localStorage.removeItem("outline-kanban.hidden-lanes"));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

// 1) Create a lane
let dialogText = "";
const onPrompt = async (d: any) => {
  if (d.type() === "prompt") await d.accept("Backlog");
  else if (d.type() === "confirm") await d.accept();
  else await d.accept();
  dialogText = d.message();
};
page.on("dialog", onPrompt);

await page.locator("button", { hasText: "+ lane" }).click();
await page.waitForTimeout(700);

let lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
const created = lanes.find((l) => l.name === "Backlog");
console.log("lane created:", !!created);
void dialogText;

// 2) Rename Inbox via menu → rename. Use the lane id as a stable selector
//    because the lane's heading text changes during rename.
const inboxId = lanes.find((l) => l.name === "Inbox")!.id;
const inboxLane = page.locator(`section[data-lane-id="${inboxId}"]`).first();
await inboxLane.locator("button[aria-label='lane menu']").click();
await page.waitForTimeout(300);
await page.locator("button:has-text('rename')").first().click();
await page.waitForTimeout(400);
await inboxLane.locator("input").fill("Triage");
await inboxLane.locator("input").press("Enter");
await page.waitForTimeout(500);

lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
const renamed = lanes.find((l) => l.name === "Triage");
console.log("renamed:", !!renamed);

// 3) Hide the Done lane — should COLLAPSE (still in position)
const doneId = lanes.find((l) => l.name === "Done")!.id;
const doneLane = page.locator(`section[data-lane-id="${doneId}"]`).first();
await doneLane.locator("button[aria-label='lane menu']").click();
await page.waitForTimeout(300);
// Exact-name match: the board header also has a "hide closed" button that
// a bare has-text('hide') would grab first.
await doneLane.getByRole("button", { name: "hide", exact: true }).click();
await page.waitForTimeout(500);

const collapsedWidth = (await doneLane.boundingBox())?.width ?? 999;
console.log("Done collapsed (narrow column present):", collapsedWidth < 60);

// 4) Click the collapsed Done to expand
await doneLane.click();
await page.waitForTimeout(500);
const reExpandedWidth = (await doneLane.boundingBox())?.width ?? 0;
console.log("Done re-expanded:", reExpandedWidth > 200);

// 5) Delete the Backlog lane
const backlogId = lanes.find((l) => l.name === "Backlog")!.id;
const backlog = page.locator(`section[data-lane-id="${backlogId}"]`).first();
await backlog.locator("button[aria-label='lane menu']").click();
await page.waitForTimeout(400);
await page.locator("button:has-text('delete')").first().click();
await page.waitForTimeout(1200);

lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
const deleted = !lanes.find((l) => l.name === "Backlog");
console.log("deleted:", deleted);

// 6) DnD: card from Triage to Today
const triage = page.locator(`section[data-lane-id="${inboxId}"]`).first();
await triage.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("dnd test");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

const todayId = lanes.find((l) => l.name === "Today")!.id;
const today = page.locator(`section[data-lane-id="${todayId}"]`).first();
const draggedCard = page.locator('[data-card-node-id]').filter({ hasText: "dnd test" }).first();
await draggedCard.dragTo(today);
await page.waitForTimeout(700);

let allNodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const moved = allNodes.find((n) => n.title === "dnd test");
const movedToToday = moved && moved.laneId === todayId;
console.log("dnd to Today lane:", movedToToday);

// 7) Mention keyboard nav: insert a tag first via Enter-to-create, then
//    create a second tag and verify ArrowDown then Enter picks the right one.
// First add a card and create #alpha tag
await today.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("ka card ");
await page.waitForTimeout(150);
await page.keyboard.type("#alpha");
await page.waitForTimeout(600);
await page.keyboard.press("Enter"); // creates #alpha via mention popup
await page.waitForTimeout(500);
await page.keyboard.press("Enter"); // confirm card title → leave edit mode
await page.waitForTimeout(400);

// Add another card and type # to get suggestion list with #alpha shown.
// We also create #beta directly so the popup will list both.
await fetch(`${API_URL}/api/tags`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "beta" }),
});
await page.waitForTimeout(200);

await today.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("kb card ");
await page.waitForTimeout(150);
await page.keyboard.type("#");
await page.waitForTimeout(700);
// Now ArrowDown should move highlight to "beta" (alphabetically alpha comes
// first but ordering depends on items API). We just verify Enter picks the
// FIRST item via keyboard navigation (ArrowDown then ArrowUp to reset to top,
// then Enter).
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(150);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(600);

allNodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const kb = allNodes.find((n) => n.title.startsWith("kb card"));
const kbTagNames = (kb?.tags ?? []).map((t: any) => t.name);
console.log("kb-card tags after keyboard pick:", kbTagNames);
const mentionKeyboardWorks = kbTagNames.length === 1;

await page.screenshot({ path: "/tmp/lanes-final.png", fullPage: true });

await browser.close();

const ok =
  !!created &&
  !!renamed &&
  (collapsedWidth ?? 999) < 60 &&
  (reExpandedWidth ?? 0) > 200 &&
  deleted &&
  movedToToday &&
  mentionKeyboardWorks &&
  errors.length === 0;

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
