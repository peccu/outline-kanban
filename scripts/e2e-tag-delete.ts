// T3: delete an unused tag from the tag manager.
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
const TAG = "del" + Date.now().toString(36);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("dialog", (d) => d.accept());

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("tagged ");
await page.waitForTimeout(150);
await page.keyboard.type("#" + TAG);
await page.waitForTimeout(700);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);

async function tagNames() {
  const tags = (await fetch(`${API_URL}/api/tags`).then((r) => r.json())) as any[];
  return tags.map((t) => t.name);
}
check("tag created", (await tagNames()).includes(TAG));

// Open the tag manager and delete the tag.
await page.locator('header button:has-text("tags")').click();
await page.waitForTimeout(300);
check("tag manager open", await page.getByRole("heading", { name: "tags" }).isVisible());
await page.locator(`button[aria-label="delete tag ${TAG}"]`).click();
await page.waitForTimeout(500);

check("tag deleted from list", !(await tagNames()).includes(TAG), JSON.stringify(await tagNames()));

const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const n = nodes.find((x) => x.title.includes("tagged"));
check(
  "tag detached from card",
  !(n?.tags ?? []).some((t: any) => t.name === TAG),
);

await page.screenshot({ path: "/tmp/tag-delete.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
