// T7: attach / detach tags from the detail modal.
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
const uniq = `t${Date.now().toString(36)}`;
const TAG_A = `${uniq}a`;
const TAG_B = `${uniq}b`;

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
await page.keyboard.type("tag host");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

await todayLane.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);
check("modal opened", await page.locator("text=description (markdown)").isVisible());

const tagInput = page.locator('input[placeholder^="add a tag"]');

// Create + attach TAG_A
await tagInput.click();
await tagInput.fill(TAG_A);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);

async function nodeTags() {
  const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  const n = nodes.find((x) => x.title === "tag host");
  return { id: n?.id, names: (n?.tags ?? []).map((t: any) => t.name).sort() };
}

let t = await nodeTags();
check("created tag attached to node", t.names.includes(TAG_A), JSON.stringify(t.names));
check(
  "attached tag pill rendered",
  (await page.locator(`text=#${TAG_A}`).count()) > 0,
);

// Attach a second tag
await tagInput.fill(TAG_B);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
t = await nodeTags();
check("second tag attached", t.names.includes(TAG_A) && t.names.includes(TAG_B), JSON.stringify(t.names));

// Detach TAG_A via its ✕ button
await page.locator(`button[aria-label="remove tag ${TAG_A}"]`).click();
await page.waitForTimeout(500);
t = await nodeTags();
check("tag detached", !t.names.includes(TAG_A) && t.names.includes(TAG_B), JSON.stringify(t.names));

// Re-attach TAG_A via suggestion (it now exists but is unattached)
await tagInput.fill(uniq);
await page.waitForTimeout(200);
const suggestion = page.locator(`button:has-text("#${TAG_A}")`).first();
check("suggestion shows existing unattached tag", (await suggestion.count()) > 0);

await page.screenshot({ path: "/tmp/detail-tags.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
