// Blank cards must not be left behind: a card created via "+ add" whose
// title is still empty when editing ends (Escape or clicking elsewhere)
// is discarded. A card with a typed title survives Escape as usual.
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

async function rootTitles(): Promise<string[]> {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  return all.filter((n) => n.parentId === null).map((n) => n.title);
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
const addBtn = todayLane.locator('button[data-role="add-node"]');

// --- 1. add → Escape with no title → card discarded ---
await addBtn.click();
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
let titles = await rootTitles();
check("blank card discarded on Escape", titles.length === 0, JSON.stringify(titles));

// --- 2. add → click elsewhere with no title → card discarded ---
await addBtn.click();
await page.waitForTimeout(400);
await page.locator("header, h1, body").first().click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(600);
titles = await rootTitles();
check("blank card discarded on focus-out", titles.length === 0, JSON.stringify(titles));

// --- 3. add → type a title → Escape → card kept ---
await addBtn.click();
await page.waitForTimeout(400);
await page.keyboard.type("keep me", { delay: 30 });
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
titles = await rootTitles();
check(
  "titled card survives Escape",
  titles.length === 1 && titles[0] === "keep me",
  JSON.stringify(titles),
);

// --- 4. add → type then erase everything → Escape → card discarded ---
await addBtn.click();
await page.waitForTimeout(400);
await page.keyboard.type("oops", { delay: 30 });
for (let i = 0; i < "oops".length; i++) {
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(60);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
titles = await rootTitles();
check(
  "emptied-out card discarded on Escape",
  titles.length === 1 && titles[0] === "keep me",
  JSON.stringify(titles),
);

await page.screenshot({ path: "/tmp/blank-discard.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);

const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
