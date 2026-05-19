import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5174";
const API_URL = process.env.API_URL ?? "http://localhost:5173";

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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

// Add a card
const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("ship modal");
await page.waitForTimeout(300);

await page.screenshot({ path: "/tmp/modal-00-card.png", fullPage: true });

// Hover the card and open the detail modal
const card = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .locator("text=ship modal")
  .first();
await card.hover();
await page.waitForTimeout(200);
const openBtn = page.locator('button[data-role="open-detail"]').first();
await openBtn.click({ force: true });
await page.waitForTimeout(400);

await page.screenshot({ path: "/tmp/modal-01-opened.png", fullPage: true });

// Verify modal is visible
const modalVisible = await page.locator("text=description (markdown)").isVisible();
console.log("modal visible:", modalVisible);

// Type description and save
const descTextarea = page.locator('textarea[placeholder="add details…"]');
await descTextarea.click();
await descTextarea.fill("- step 1\n- step 2\n- step 3");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^save$/ }).click();
await page.waitForTimeout(500);

// Verify description saved
let nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
let n = nodes.find((x) => x.title === "ship modal");
console.log("body saved:", JSON.stringify(n?.bodyMd));

// Add a comment
const commentBox = page.locator('textarea[placeholder="add a comment…"]');
await commentBox.click();
await commentBox.fill("looks good, ready to start");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^post$/ }).click();
await page.waitForTimeout(500);

await page.screenshot({ path: "/tmp/modal-02-with-comment.png", fullPage: true });

const comments = (await fetch(`${API_URL}/api/nodes/${n?.id}/comments`).then(
  (r) => r.json(),
)) as any[];
console.log("comments:", comments.length, comments.map((c) => c.bodyMd));

// Close via Escape
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const modalGone = !(await page
  .locator("text=description (markdown)")
  .isVisible()
  .catch(() => false));
console.log("modal closed by Escape:", modalGone);

await page.screenshot({ path: "/tmp/modal-03-after-close.png", fullPage: true });

const ok =
  modalVisible &&
  n?.bodyMd === "- step 1\n- step 2\n- step 3" &&
  comments.length === 1 &&
  comments[0]?.bodyMd === "looks good, ready to start" &&
  modalGone &&
  errors.length === 0;

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);

await browser.close();
process.exit(ok ? 0 : 1);
