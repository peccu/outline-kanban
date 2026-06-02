// T14: once a #tag is turned into a tag, it lives as a pill and is stripped
// from the persisted title.
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
const TAG = "zz" + Date.now().toString(36);
await page.keyboard.type("buy milk ");
await page.waitForTimeout(150);
await page.keyboard.type("#" + TAG);
await page.waitForTimeout(700);
await page.keyboard.press("Enter"); // accept "create #<tag>"
await page.waitForTimeout(600);

async function card() {
  const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  const c = nodes.find((n) => n.title.includes("buy milk"));
  return { title: c?.title, tags: (c?.tags ?? []).map((t: any) => t.name) };
}

let c = await card();
check("tag attached", c.tags.includes(TAG), JSON.stringify(c.tags));
check(`title stripped of #`, !c.title.includes("#" + TAG), JSON.stringify(c.title));
check("title keeps plain text", c.title.includes("buy milk"), JSON.stringify(c.title));

// Reload: title should remain clean, tag shown as a pill.
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);

const editorText = await todayLane
  .locator('.ProseMirror:has-text("buy milk")')
  .first()
  .innerText();
check(`after reload editor has no #`, !editorText.includes("#" + TAG), JSON.stringify(editorText));
check(
  "after reload tag pill present",
  (await todayLane.locator(`text=#${TAG}`).count()) > 0,
);

await page.screenshot({ path: "/tmp/tag-strip-title.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
