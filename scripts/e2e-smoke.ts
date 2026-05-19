import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5174";

const errors: string[] = [];
const logs: string[] = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });

page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const screenshot = (name: string) =>
  page.screenshot({ path: `/tmp/outline-${name}.png`, fullPage: true });

await screenshot("00-board");

// Pick the Today lane (2nd) and add an item
const todayLane = page.locator("section", { has: page.getByText("Today", { exact: true }) }).first();
await todayLane.getByRole("button", { name: /^\+ add$/ }).click();
await page.waitForTimeout(400);
await page.keyboard.type("ship outline kanban ");
await page.waitForTimeout(150);
await page.keyboard.type("#mvp");
await page.waitForTimeout(700);
await page.keyboard.press("Enter"); // create #mvp via mention popup
await page.waitForTimeout(400);
await screenshot("01-typed");

// Enter to create sibling
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.type("write integration tests");
await page.waitForTimeout(300);
await screenshot("02-sibling");

// Shift+ArrowRight should move the focused root node into "Doing" lane
await page.keyboard.press("Shift+ArrowRight");
await page.waitForTimeout(600);
await screenshot("03-moved-to-doing");

// Click the status bullet on the first node (now in "ship outline kanban")
const shipNode = page.locator("text=ship outline kanban").first();
const shipBullet = shipNode
  .locator("xpath=ancestor::div[contains(@class,'group')]")
  .first()
  .locator("button")
  .first();
await shipBullet.click();
await page.waitForTimeout(400);
await screenshot("04-status-cycled");

console.log(`\n=== console (last 20 of ${logs.length}) ===`);
for (const l of logs.slice(-20)) console.log(l);
console.log(`\n=== page errors (${errors.length}) ===`);
for (const e of errors) console.log(e);

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
