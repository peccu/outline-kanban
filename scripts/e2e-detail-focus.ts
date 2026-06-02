// T5: confirming the title (Enter) moves focus into the description editor.
// T8: the comment textarea is comfortably tall.
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
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("focus test");
await page.waitForTimeout(200);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

const card = todayLane.locator("[data-card-node-id]").first();
await card.click();
await page.waitForTimeout(500);
check(
  "modal opened",
  await page.locator("text=description (markdown)").isVisible(),
);

// Enter title-edit mode (focus the title container + Enter; the inner editor
// is pointer-events:none in view mode), append text, confirm with Enter.
const titleBox = page.locator('[title="Enter or double-click to edit"]');
await titleBox.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.keyboard.type(" edited");
await page.waitForTimeout(200);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

// T5: focus should now be in the description textarea.
const focusIsDescription = await page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return el?.tagName === "TEXTAREA" &&
    (el as HTMLTextAreaElement).placeholder === "add details…";
});
check("focus moved to description after title Enter", focusIsDescription);

// T8: comment textarea is at least 8rem (128px) tall.
const commentMinH = await page
  .locator('textarea[placeholder="add a comment…"]')
  .evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
check(
  "comment textarea min-height >= 128px",
  commentMinH >= 128,
  `${commentMinH}px`,
);

// T13: re-enter title edit, then Escape to save & exit purely by keyboard.
await titleBox.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.keyboard.type(" more");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

const afterEscape = await page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return {
    onContainer: el?.getAttribute("title") === "Enter or double-click to edit",
    proseMirrorFocused: !!document.querySelector(".ProseMirror-focused"),
  };
});
check("title Escape lands focus on the title container", afterEscape.onContainer);
check("title editor no longer focused after Escape", !afterEscape.proseMirrorFocused);

const savedTitle = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json()))
  .find?.((n: any) => n.title?.includes("focus test"))?.title;
check(
  "title saved after keyboard Escape",
  savedTitle === "focus test edited more",
  `got "${savedTitle}"`,
);

await page.screenshot({ path: "/tmp/detail-focus.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
