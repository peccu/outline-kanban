// Tag removal: verify that mention chips are removed immediately after
// insertion (tag shows as TagPill only), and that the detail view's ✕
// button properly detaches the tag.
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
await page.keyboard.type("a card ");
await page.waitForTimeout(150);
await page.keyboard.type("#urg");
await page.waitForTimeout(700);
// accept the "create #urg" suggestion
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
// leave inline edit mode — a click on a card that's still being edited
// goes to the editor instead of opening the detail modal
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

await page.screenshot({ path: "/tmp/tag-remove-01-attached.png", fullPage: true });

async function card() {
  const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  const c = nodes.find((n: any) => n.title.includes("a card"));
  return { title: c?.title ?? "", tags: (c?.tags ?? []).map((t: any) => t.name) };
}

// --- verify chip is gone immediately (no inline mention in editor) ---
const editorText = await todayLane
  .locator('.ProseMirror')
  .first()
  .innerText()
  .catch(() => "");
check("mention chip removed from editor", !editorText.includes("#urg"), JSON.stringify(editorText));

let c = await card();
check("tag attached after #mention", c.tags.includes("urg"), JSON.stringify(c.tags));
check("title saved without #tag text", !c.title.includes("#urg"), JSON.stringify(c.title));

// --- remove tag via detail view ✕ button ---
await todayLane.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);
check("detail modal opened", await page.locator("text=description (markdown)").isVisible());

await page.locator('button[aria-label="remove tag urg"]').click();
await page.waitForTimeout(500);

await page.screenshot({ path: "/tmp/tag-remove-02-detached.png", fullPage: true });

// Close modal
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

c = await card();
check("tag detached via detail view", !c.tags.includes("urg"), JSON.stringify(c.tags));

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
