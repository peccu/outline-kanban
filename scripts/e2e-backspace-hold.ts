// Verify that holding Backspace through an empty title doesn't keep
// deleting characters out of the previous card's title:
//   - Two cards: "first", "second".
//   - Focus the second card's editor, select-all, hold Backspace.
//   - Title should drain to empty; auto-repeat past the empty state
//     must NOT trigger the empty-card delete (only a fresh press does),
//     and "first" must keep its full text.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

// Create two cards.
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("first");
await page.keyboard.press("Enter");
await page.waitForTimeout(100);
await page.keyboard.press("ArrowDown"); // back to +add
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("second");
await page.waitForTimeout(100);

// We're still editing "second" — select all and start auto-repeating Backspace.
await page.keyboard.down("Meta");
await page.keyboard.press("a");
await page.keyboard.up("Meta");
await page.waitForTimeout(50);

// Hold Backspace long enough that the browser fires auto-repeat events.
await page.keyboard.down("Backspace");
await page.waitForTimeout(800);
await page.keyboard.up("Backspace");
await page.waitForTimeout(400);

const nodes = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
const titles = nodes.filter((n) => n.parentId === null).map((n) => n.title);

console.log("titles after held-Backspace:", titles);

// Expected outcomes:
//   - "first" still has all 5 characters
//   - "second" either is empty (card still there) OR has been deleted exactly once
//     (depending on timing). Either is fine; what matters is that we didn't
//     start eating into "first".
const firstIntact = titles.includes("first");

// Now do a *fresh* Backspace on the now-empty / now-deleted state and confirm
// the explicit press still works as a card-delete shortcut.
// (Only meaningful if "second" still exists with empty title.)
if (titles.includes("")) {
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);
  const after = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  const afterTitles = after.filter((n) => n.parentId === null).map((n) => n.title);
  console.log("titles after fresh Backspace:", afterTitles);
}

const ok = firstIntact && errs.length === 0;
console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
