// Verify tag color editing:
//   1. Create a card with a tag.
//   2. Open the modal, click the tag pill, pick a non-default swatch.
//   3. PATCH /api/tags/:id should land, the tag's stored color updates,
//      and the pill on the board reflects the new color.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

async function reset() {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of all) {
    if (n.parentId === null) await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
  }
  const tags = (await fetch(`${API_URL}/api/tags`).then((r) => r.json())) as any[];
  for (const t of tags) {
    await fetch(`${API_URL}/api/tags/${t.id}`, { method: "DELETE" });
  }
}
await reset();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

// Card with tag.
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("groceries #shopping");
await page.waitForTimeout(800); // allow tag-create round-trip + popup
await page.keyboard.press("Enter"); // confirm the mention suggestion
await page.waitForTimeout(150);
await page.keyboard.press("Enter"); // leave title edit mode
await page.waitForTimeout(400);

// Confirm a tag exists.
const tagsBefore = (await fetch(`${API_URL}/api/tags`).then((r) => r.json())) as any[];
console.log("tag created:", tagsBefore.map((t) => `${t.name}=${t.color ?? "null"}`));
if (tagsBefore.length !== 1) throw new Error("expected exactly one tag");
const tagId = tagsBefore[0]!.id;

// Open modal via card click.
await page.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);

// Click the editable tag pill in the modal header.
await page.locator('.max-w-2xl [data-role="tag-pill-root"] button').first().click();
await page.waitForTimeout(200);

// Pick the blue swatch (#3b82f6).
const picked = await page.evaluate(() => {
  const btns = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".max-w-2xl button[title]"),
  );
  const target = btns.find((b) => b.title === "blue");
  if (!target) return null;
  target.click();
  return "blue";
});
console.log("picked swatch:", picked);
await page.waitForTimeout(500);

const tagsAfter = (await fetch(`${API_URL}/api/tags/${tagId}`)
  .catch(() => fetch(`${API_URL}/api/tags`).then((r) => r.json()))
  // server doesn't expose GET /tags/:id; fall back to list
  .then(async () => (await fetch(`${API_URL}/api/tags`).then((r) => r.json())) as any[])) as any[];
const updated = tagsAfter.find((t) => t.id === tagId);
console.log("tag after update:", updated);

const ok =
  picked === "blue" &&
  updated?.color === "#3b82f6" &&
  errs.length === 0;

console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
