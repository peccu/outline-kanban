import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";

const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

// Create first node in Today lane
const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("parent");
await page.waitForTimeout(200);

// Create a sibling (M-Enter, since plain Enter now confirms + blurs)
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(400);
await page.keyboard.type("child-to-be");
await page.waitForTimeout(200);

// Indent (Tab) — focus MUST stay on the editor
await page.keyboard.press("Tab");
await page.waitForTimeout(600);

const isProseMirrorFocused = await page.evaluate(
  () => document.activeElement?.classList?.contains("ProseMirror") ?? false,
);
console.log(`ProseMirror focused after Tab: ${isProseMirrorFocused}`);

// Try to keep typing without re-focusing
await page.keyboard.type(" appended-after-indent");
await page.waitForTimeout(500);

await page.screenshot({ path: "/tmp/tab-focus-after.png", fullPage: true });

// Grab the second node's text and verify the appended text landed there
const nodeTexts = await page.locator(".ProseMirror").allInnerTexts();
console.log("nodes:", JSON.stringify(nodeTexts));
const childRow = nodeTexts.find((t) => t.includes("child-to-be"));
console.log("child row text:", childRow);

const focusRetained = !!childRow && childRow.includes("appended-after-indent");
console.log(`focus retained after Tab: ${focusRetained}`);

console.log(`page errors: ${errors.length}`);
for (const e of errors) console.log(e);

await browser.close();
process.exit(focusRetained && errors.length === 0 ? 0 : 1);
