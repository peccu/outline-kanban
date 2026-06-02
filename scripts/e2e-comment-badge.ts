// T12: cards show a 💬 badge with the comment count.
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
await page.keyboard.type("commented card");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

const card = todayLane.locator('[data-card-node-id]:has-text("commented card")').first();

check("no badge before any comment", (await card.locator('text=💬').count()) === 0);

// Open detail, add two comments.
await card.click();
await page.waitForTimeout(500);
const commentBox = page.locator('textarea[placeholder="add a comment…"]');
for (const text of ["first note", "second note"]) {
  await commentBox.click();
  await commentBox.fill(text);
  await page.getByRole("button", { name: /^post$/ }).click();
  await page.waitForTimeout(400);
}
await page.keyboard.press("Escape"); // close modal (focus on post button)
await page.waitForTimeout(500);

const badge = card.locator('text=💬');
check("badge shown after commenting", (await badge.count()) > 0);
const badgeText = (await badge.first().innerText().catch(() => "")) || "";
check("badge shows count 2", badgeText.includes("2"), JSON.stringify(badgeText));

await page.screenshot({ path: "/tmp/comment-badge.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
