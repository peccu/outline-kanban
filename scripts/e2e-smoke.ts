import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5174";

const errors: string[] = [];
const logs: string[] = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");

const todayVisible = await page
  .locator("h2", { hasText: /today/i })
  .first()
  .isVisible()
  .catch(() => false);
console.log(`lane 'Today' header visible: ${todayVisible}`);

const screenshot = (name: string) =>
  page.screenshot({ path: `/tmp/outline-${name}.png`, fullPage: true });

await screenshot("00-initial");

const addBtn = page.getByRole("button", { name: /^\+ add$/ }).first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(400);
  await page.keyboard.type("first item ");
  await page.waitForTimeout(150);
  await page.keyboard.type("#urg");
  await page.waitForTimeout(700);
  await screenshot("01-mention-open");

  // Accept the "create #urg" suggestion (Enter while popup is open)
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await screenshot("02-mention-inserted");

  // Enter again (popup closed) → should create a sibling
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.keyboard.type("second item");
  await page.waitForTimeout(400);
  await screenshot("03-sibling-created");

  // Tab: indent
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  await screenshot("04-indented");
}

console.log(`\n=== console (last 30 of ${logs.length}) ===`);
for (const l of logs.slice(-30)) console.log(l);
console.log(`\n=== page errors (${errors.length}) ===`);
for (const e of errors) console.log(e);

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
