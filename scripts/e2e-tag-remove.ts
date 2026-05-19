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
await page.waitForTimeout(500);

// Verify the tag is attached
let nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
let card = nodes.find((n) => n.title.includes("a card"));
const attachedTags = card?.tags?.map((t: any) => t.name) ?? [];
console.log("attached after insert:", attachedTags);

await page.screenshot({ path: "/tmp/tag-remove-01-attached.png", fullPage: true });

// Focus the editor, select all, retype just the plain title to drop the mention.
const editor = page.locator(".ProseMirror").first();
await editor.click();
await page.waitForTimeout(150);
await page.keyboard.press("Control+A");
await page.keyboard.press("Meta+A");
await page.waitForTimeout(100);
await page.keyboard.type("a card");
await page.waitForTimeout(800);

await page.screenshot({ path: "/tmp/tag-remove-02-deleted.png", fullPage: true });

nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
card = nodes.find((n) => n.title.includes("a card"));
const tagsAfter = card?.tags?.map((t: any) => t.name) ?? [];
console.log("attached after backspace:", tagsAfter);
console.log("title now:", JSON.stringify(card?.title));

const ok = attachedTags.includes("urg") && tagsAfter.length === 0 && errors.length === 0;
console.log(`\nresult: ${ok ? "PASS" : "FAIL"}`);
console.log("page errors:", errors.length);
for (const e of errors) console.log(e);

await browser.close();
process.exit(ok ? 0 : 1);
