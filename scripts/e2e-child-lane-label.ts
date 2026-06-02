// T10: a subtask can belong to a different lane (shown as a chip); choosing a
// lane (detail or DnD) relabels it without moving it out from under its parent.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

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
const doing = lanes.find((l) => l.name === "Doing");
const done = lanes.find((l) => l.name === "Done");

const errors: string[] = [];
const failures: string[] = [];
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();

// Parent + indented child.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("p10 parent");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(400);
await page.keyboard.type("c10 child");
await page.waitForTimeout(150);
await page.keyboard.press("Tab");
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

async function child() {
  const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  return nodes.find((n) => n.title.includes("c10 child"));
}

let c = await child();
check("child created under parent", !!c && c.parentId !== null, JSON.stringify({ p: c?.parentId }));
check("child has no lane chip initially", (await todayLane.locator('[data-card-node-id]:has-text("c10 child")').locator('text=Doing').count()) === 0);

// Open the child's detail and assign it to the Doing lane.
await todayLane.locator('[data-card-node-id]:has-text("c10 child")').first().click();
await page.waitForTimeout(500);
await page.locator("section:has(h3:text-is('lane')) button", { hasText: "Doing" }).click();
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

c = await child();
check("child lane set to Doing", c?.laneId === doing?.id, `laneId=${c?.laneId}`);
check("child stayed under its parent", c?.parentId !== null);
check(
  "child shows Doing lane chip",
  (await todayLane.locator('[data-card-node-id]:has-text("c10 child")').locator('text=Doing').count()) > 0,
);
check(
  "child not rendered as a root in Doing column",
  (await page
    .locator("section", { has: page.getByText("Doing", { exact: true }) })
    .first()
    .locator('[data-root-card]:has-text("c10 child")')
    .count()) === 0,
);

await page.screenshot({ path: "/tmp/child-lane-detail.png", fullPage: true });

// Now relabel via drag-and-drop onto the Done lane.
async function dragChildToLane(childTitle: string, laneName: string) {
  await page.evaluate(
    ({ childTitle, laneName }) => {
      const cards = Array.from(document.querySelectorAll("[data-card-node-id]"));
      const src = cards.find((el) => (el.textContent ?? "").includes(childTitle)) as HTMLElement;
      if (!src) throw new Error("child card not found");
      const sections = Array.from(document.querySelectorAll("section[data-lane-id]"));
      const lane = sections.find((s) => (s.textContent ?? "").includes(laneName)) as HTMLElement;
      if (!lane) throw new Error("lane not found");
      const inner = lane.querySelector<HTMLElement>(":scope > div.overflow-y-auto") ?? lane;
      const r = inner.getBoundingClientRect();
      const dt = new DataTransfer();
      const fire = (el: EventTarget, type: string, x: number, y: number) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y } as DragEventInit));
      const sr = src.getBoundingClientRect();
      fire(src, "dragstart", sr.left + 5, sr.top + 5);
      dt.setData("application/x-node-id", (src as HTMLElement).dataset.cardNodeId ?? "");
      const x = r.left + r.width / 2;
      const y = r.top + r.height - 30;
      fire(inner, "dragenter", x, y);
      fire(inner, "dragover", x, y);
      fire(inner, "drop", x, y);
      fire(src, "dragend", x, y);
    },
    { childTitle, laneName },
  );
}
await dragChildToLane("c10 child", "Done");
await page.waitForTimeout(500);

c = await child();
check("DnD relabeled child to Done", c?.laneId === done?.id, `laneId=${c?.laneId}`);
check("child still under parent after DnD", c?.parentId !== null);
check(
  "child still under parent in Today column after DnD",
  (await todayLane.locator('[data-card-node-id]:has-text("c10 child")').count()) > 0,
);

await page.screenshot({ path: "/tmp/child-lane-dnd.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
