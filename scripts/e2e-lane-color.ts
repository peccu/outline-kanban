// T11: change a lane's color from the lane menu.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

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

async function laneColor(name: string) {
  const lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
  return lanes.find((l) => l.name === name)?.color ?? null;
}

// Reset Today's color so the test is deterministic.
{
  const lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
  const today = lanes.find((l) => l.name === "Today");
  await fetch(`${API_URL}/api/lanes/${today.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color: null }),
  });
}
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

const todayHeader = page.locator("header", {
  has: page.getByText("Today", { exact: true }),
}).first();

await todayHeader.locator('button[aria-label="lane menu"]').click();
await page.waitForTimeout(200);
await todayHeader.locator('button[aria-label="set lane color blue"]').click();
await page.waitForTimeout(500);

const color = await laneColor("Today");
check("lane color persisted as blue", color === "#3b82f6", `${color}`);

// The header dot should reflect the new color.
const dotBg = await todayHeader
  .locator("span.rounded-full")
  .first()
  .evaluate((el) => getComputedStyle(el).backgroundColor);
check("header dot reflects color", dotBg === "rgb(59, 130, 246)", dotBg);

await page.screenshot({ path: "/tmp/lane-color.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
