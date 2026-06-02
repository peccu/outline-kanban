import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

// Start from a clean board: counting cards by text is only meaningful if prior
// runs haven't left their own "collapse-child" rows behind.
async function resetData() {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of all) {
    if (n.parentId === null) {
      await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
    }
  }
}
await resetData();

const errors: string[] = [];
const failures: string[] = [];
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
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

// Create a parent node.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("collapse-parent");
await page.waitForTimeout(200);
await page.keyboard.press("Enter"); // confirm + leave edit → card in view mode
await page.waitForTimeout(300);

// Create a sibling and indent it so it becomes a subtask of the parent.
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(400);
await page.keyboard.type("collapse-child");
await page.waitForTimeout(200);
await page.keyboard.press("Tab"); // indent under previous sibling (the parent)
await page.waitForTimeout(600);
await page.keyboard.press("Escape"); // leave edit → child card in view mode
await page.waitForTimeout(300);

const parentCard = todayLane.locator(
  '[data-card-node-id]:has-text("collapse-parent")',
).first();
const childCard = todayLane.locator(
  '[data-card-node-id]:has-text("collapse-child")',
);
const toggle = parentCard.locator(
  'button[aria-label$="subtasks"], button[aria-label*="subtask"]',
).first();

// Subtask is visible and the parent shows a fold toggle (expanded).
check("child subtask visible initially", (await childCard.count()) > 0);
check("fold toggle present on parent", (await toggle.count()) > 0);
check(
  "toggle reports expanded",
  (await toggle.getAttribute("aria-expanded")) === "true",
);

// Focus the parent card (view mode) and press Tab to collapse.
await parentCard.focus();
await page.waitForTimeout(100);
await page.keyboard.press("Tab");
await page.waitForTimeout(300);

check("child hidden after Tab", (await childCard.count()) === 0);
check(
  "toggle reports collapsed",
  (await toggle.getAttribute("aria-expanded")) === "false",
);
const badge = parentCard.locator('button:has-text("…")');
check("collapsed badge shown", (await badge.count()) > 0);

await page.screenshot({ path: "/tmp/collapse-collapsed.png", fullPage: true });

// Tab again to expand.
await parentCard.focus();
await page.waitForTimeout(100);
await page.keyboard.press("Tab");
await page.waitForTimeout(300);

check("child visible again after second Tab", (await childCard.count()) > 0);
check(
  "toggle reports expanded again",
  (await toggle.getAttribute("aria-expanded")) === "true",
);

// Persistence: collapse, reload, expect it to stay collapsed.
await parentCard.focus();
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
check(
  "stays collapsed after reload",
  (await todayLane
    .locator('[data-card-node-id]:has-text("collapse-child")')
    .count()) === 0,
);

await page.screenshot({ path: "/tmp/collapse-after-reload.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);

const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
