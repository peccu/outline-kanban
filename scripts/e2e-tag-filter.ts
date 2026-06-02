// T4: filter the board by tag (OR semantics, ancestors kept visible).
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
const TAG = "flt" + Date.now().toString(36);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("dialog", (d) => d.accept());

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();

// Card A — tagged.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("alpha host ");
await page.waitForTimeout(150);
await page.keyboard.type("#" + TAG);
await page.waitForTimeout(700);
await page.keyboard.press("Enter"); // accept create suggestion
await page.waitForTimeout(300);
await page.keyboard.press("Enter"); // confirm card
await page.waitForTimeout(300);

// Card B — untagged.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("gamma plain");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

const cardA = () => todayLane.locator('[data-card-node-id]:has-text("alpha host")');
const cardB = () => todayLane.locator('[data-card-node-id]:has-text("gamma plain")');

check("both cards visible before filter", (await cardA().count()) > 0 && (await cardB().count()) > 0);

// Turn on the filter for TAG.
await page.locator('header button:has-text("tags")').click();
await page.waitForTimeout(300);
await page.locator(`button[aria-label="filter by tag ${TAG}"]`).click();
await page.waitForTimeout(300);
await page.keyboard.press("Escape"); // close manager
await page.waitForTimeout(400);

check("tagged card stays visible", (await cardA().count()) > 0);
check("untagged card hidden", (await cardB().count()) === 0);
check("header shows filter active", await page.locator('header button:has-text("tags · 1")').isVisible());

await page.screenshot({ path: "/tmp/tag-filter-on.png", fullPage: true });

// Clear filter — both back.
await page.locator('header button:has-text("tags")').click();
await page.waitForTimeout(300);
await page.locator('button:has-text("clear filter")').click();
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

check("both cards visible after clearing filter", (await cardA().count()) > 0 && (await cardB().count()) > 0);

await page.screenshot({ path: "/tmp/tag-filter-off.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
