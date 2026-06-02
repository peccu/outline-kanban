// T6: the detail "lane" selector lists real lanes and moving reflects on the
// board (lane == status).
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
const today = lanes.find((l) => l.name === "Today");
const doing = lanes.find((l) => l.name === "Doing");

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
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("lane mover");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

await todayLane.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);

check("lane section visible", await page.getByRole("heading", { name: "lane" }).isVisible());
// All real lanes listed (at least the 4 defaults).
const laneButtons = page.locator("section:has(h3:text-is('lane')) button");
check("lists all lanes", (await laneButtons.count()) === lanes.length, `${await laneButtons.count()} vs ${lanes.length}`);

// Move to Doing.
await page.locator("section:has(h3:text-is('lane')) button", { hasText: "Doing" }).click();
await page.waitForTimeout(500);

const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const n = nodes.find((x) => x.title === "lane mover");
check("node moved to Doing lane", n?.laneId === doing?.id, `laneId=${n?.laneId}`);

// Close modal and confirm the card now lives in the Doing column.
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const doingCol = page
  .locator("section", { has: page.getByText("Doing", { exact: true }) })
  .first();
check(
  "card now rendered in Doing column",
  (await doingCol.locator('[data-card-node-id]:has-text("lane mover")').count()) > 0,
);
check(
  "card no longer in Today column",
  (await todayLane.locator('[data-card-node-id]:has-text("lane mover")').count()) === 0,
);

await page.screenshot({ path: "/tmp/detail-lane.png", fullPage: true });

void today;
console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
