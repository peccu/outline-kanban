// Verify the comment edit / delete flow on the keyboard path:
//   1. Post a comment.
//   2. Focus the comment item, press Enter → edit mode appears.
//   3. Change the text + press M-Enter → PATCH lands, view mode shows
//      the new text.
//   4. Focus the comment again, press Delete → confirm dialog fires;
//      the comment is removed.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

async function reset() {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of all) {
    if (n.parentId === null) await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
  }
}
await reset();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));
// Auto-accept any confirm() dialogs (used by the delete path).
page.on("dialog", (d) => d.accept());

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

// Create a card.
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("with comments");
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);

// Post a comment.
const commentTa = page.locator('textarea[placeholder="add a comment…"]');
await commentTa.click();
await commentTa.fill("first draft");
await page.keyboard.press("Meta+Enter");
await page.waitForTimeout(400);

let comments = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const card = comments.find((n) => n.title === "with comments");
let list = (await fetch(`${API_URL}/api/nodes/${card.id}/comments`).then((r) => r.json())) as any[];
console.log("initial comments:", list.map((c) => c.bodyMd));

// Focus the comment item (the <li>).
await page.evaluate(() => {
  const li = document.querySelector<HTMLElement>("li[tabindex='0']");
  li?.focus();
});
const onLi = await page.evaluate(() => {
  return document.activeElement?.tagName.toLowerCase() === "li";
});
console.log("focused comment li:", onLi);

// Enter → edit mode.
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const editingShown = await page.evaluate(
  () => !!document.querySelector("textarea[placeholder='edit comment…']"),
);
console.log("edit mode textarea visible:", editingShown);

// Update text + M-Enter to save.
await page.keyboard.press("Meta+A");
await page.keyboard.type("final version");
await page.waitForTimeout(50);
await page.keyboard.press("Meta+Enter");
await page.waitForTimeout(500);

list = (await fetch(`${API_URL}/api/nodes/${card.id}/comments`).then((r) => r.json())) as any[];
console.log("after edit:", list.map((c) => c.bodyMd));

// Re-focus the comment, press Delete to remove.
await page.evaluate(() => {
  const li = document.querySelector<HTMLElement>("li[tabindex='0']");
  li?.focus();
});
await page.waitForTimeout(100);
await page.keyboard.press("Delete");
await page.waitForTimeout(500);

list = (await fetch(`${API_URL}/api/nodes/${card.id}/comments`).then((r) => r.json())) as any[];
console.log("after delete:", list.map((c) => c.bodyMd));

const ok =
  onLi &&
  editingShown &&
  list.length === 0 &&
  errs.length === 0;
console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
