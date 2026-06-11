// T15: multi-select cards (Space/m), then bulk-edit (M-Enter) to tag or move.
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

const errors: string[] = [];
const failures: string[] = [];
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(label);
}
const TAG = "bulk" + Date.now().toString(36);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();

// Create three root cards.
for (const t of ["one", "two", "three"]) {
  await todayLane.locator('button[data-role="add-node"]').click();
  await page.waitForTimeout(250);
  await page.keyboard.type(t);
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
}

// Focus the "one" card and select it + "two" via keyboard.
async function focusCard(text: string) {
  await todayLane.locator(`[data-card-node-id]:has-text("${text}")`).first().focus();
  await page.waitForTimeout(80);
}
await focusCard("one");
await page.keyboard.press(" "); // select via Space
await page.waitForTimeout(150);
await focusCard("two");
await page.keyboard.press("m"); // select via m
await page.waitForTimeout(150);

const selectedCount = await todayLane.locator("[data-selected]").count();
check("two cards selected", selectedCount === 2, `${selectedCount}`);
check("header shows selection count", await page.locator('header button:has-text("edit 2 selected")').isVisible());

// Open the bulk panel with M-Enter from a focused (selected) card.
await focusCard("two");
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(300);
check("bulk panel opened", await page.locator("text=/edit 2 selected card/").isVisible());

// Focus should move into the modal (onto the tag input), not stay on the card.
const focusInModal = await page.evaluate(() => {
  const a = document.activeElement;
  return !!a && !!a.closest('[role="dialog"][aria-modal="true"]');
});
check("focus moved into bulk modal", focusInModal);

// Bulk add a tag.
await page.locator('input[placeholder^="tag name"]').fill(TAG);
await page.keyboard.press("Enter");
await page.waitForTimeout(600);

// Bulk move to Doing.
await page.locator("text=move all to lane").locator("xpath=..").locator("button", { hasText: "Doing" }).click();
await page.waitForTimeout(700);

// Close panel.
await page.locator('button:has-text("done & clear")').click();
await page.waitForTimeout(400);

// Verify via API: "one" and "two" tagged + in Doing; "three" untouched.
const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
function info(title: string) {
  const n = nodes.find((x) => x.title === title);
  return { lane: n?.laneId, tags: (n?.tags ?? []).map((t: any) => t.name) };
}
const one = info("one");
const two = info("two");
const three = info("three");
check("'one' tagged", one.tags.includes(TAG), JSON.stringify(one.tags));
check("'two' tagged", two.tags.includes(TAG), JSON.stringify(two.tags));
check("'one' moved to Doing", one.lane === doing?.id);
check("'two' moved to Doing", two.lane === doing?.id);
check("'three' untouched", !three.tags.includes(TAG) && three.lane !== doing?.id);
check("selection cleared after done", (await todayLane.locator("[data-selected]").count()) === 0);

await page.screenshot({ path: "/tmp/multi-select.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
