// Detail modal: LANE / TAG-suggestion clusters are a single Tab stop each;
// Left/Right move within, Enter/Space activates.
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
await page.keyboard.type("roving card");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await todayLane.locator('[data-card-node-id]:has-text("roving card")').first().click();
await page.waitForTimeout(500);

const laneButtons = page.locator('[role="radiogroup"][aria-label="lane"] button');

// Only one lane button is in the Tab order (tabindex 0); the rest are -1.
const tabbable = await laneButtons.evaluateAll(
  (els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length,
);
check("exactly one lane button is tabbable", tabbable === 1, `${tabbable}`);
check("lane group has all lanes", (await laneButtons.count()) === lanes.length);

// Focus the first lane button, then ArrowRight should move focus to the 2nd.
await laneButtons.first().focus();
await page.waitForTimeout(80);
const firstName = await laneButtons.first().innerText();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(120);
const activeAfterRight = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.trim());
check("ArrowRight moves to the next lane button", !!activeAfterRight && activeAfterRight !== firstName.trim(), `now "${activeAfterRight}"`);

// Enter activates the focused lane (moves the card there).
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const node = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json()) as any[]).find((n) => n.title === "roving card");
const targetLane = lanes.find((l) => l.name.trim() === activeAfterRight);
check("Enter on focused lane moved the card there", node?.laneId === targetLane?.id, `laneId=${node?.laneId} target=${targetLane?.id}`);

// ArrowLeft wraps/moves back.
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(120);
const activeAfterLeft = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.trim());
check("ArrowLeft moves focus back", activeAfterLeft === firstName.trim(), `now "${activeAfterLeft}"`);

await page.screenshot({ path: "/tmp/detail-roving.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
