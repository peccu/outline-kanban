// T9: detail modal lists subtasks, drills into them, and shows a breadcrumb.
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

// Build root → mid → leaf via M-Enter + Tab indents.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("root task");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(400);
await page.keyboard.type("mid task");
await page.waitForTimeout(150);
await page.keyboard.press("Tab"); // mid becomes child of root
await page.waitForTimeout(600);
await page.keyboard.press("Alt+Enter"); // sibling of mid (child of root)
await page.waitForTimeout(400);
await page.keyboard.type("leaf task");
await page.waitForTimeout(150);
await page.keyboard.press("Tab"); // leaf becomes child of mid
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Sanity-check the tree shape via API.
const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const root = nodes.find((n) => n.title === "root task");
const mid = nodes.find((n) => n.title === "mid task");
const leaf = nodes.find((n) => n.title === "leaf task");
check("tree shape root>mid>leaf", mid?.parentId === root?.id && leaf?.parentId === mid?.id);

// Open root's detail.
await todayLane.locator('[data-card-node-id]:has-text("root task")').first().click();
await page.waitForTimeout(500);

const subtasksSection = page.locator("section:has(h3:text-is('subtasks'))");
check("root: subtasks lists mid task", (await subtasksSection.locator('button:has-text("mid task")').count()) > 0);
check("root: breadcrumb minimal (no ancestors)", (await page.locator('nav[aria-label="breadcrumb"]').count()) === 0);

// Drill into mid.
await subtasksSection.locator('button:has-text("mid task")').first().click();
await page.waitForTimeout(500);
check("mid: breadcrumb shows root", await page.locator('nav[aria-label="breadcrumb"] button:has-text("root task")').isVisible());
check("mid: subtasks lists leaf task", (await subtasksSection.locator('button:has-text("leaf task")').count()) > 0);

// Drill into leaf.
await subtasksSection.locator('button:has-text("leaf task")').first().click();
await page.waitForTimeout(500);
check("leaf: breadcrumb shows root and mid", (await page.locator('nav[aria-label="breadcrumb"] button').count()) >= 2);
check("leaf: no subtasks", (await subtasksSection.locator("text=no subtasks").count()) > 0);

await page.screenshot({ path: "/tmp/detail-children-leaf.png", fullPage: true });

// Navigate back up via the breadcrumb (click root).
await page.locator('nav[aria-label="breadcrumb"] button:has-text("root task")').first().click();
await page.waitForTimeout(500);
check("breadcrumb back to root shows mid again", (await subtasksSection.locator('button:has-text("mid task")').count()) > 0);

await page.screenshot({ path: "/tmp/detail-children-root.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
