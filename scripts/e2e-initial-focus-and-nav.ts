// Verify:
//   1. After app load, focus lands on the first card (or the first +add
//      when no cards exist).
//   2. ArrowDown from the bottom card moves to +add of the same lane.
//   3. ArrowUp from +add moves back to the last card.
//   4. ArrowLeft / ArrowRight from +add jumps to an adjacent lane.
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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

// 1a. With no cards, initial focus should be the first lane's +add button.
const initialOnAdd = await page.evaluate(() => {
  const ae = document.activeElement;
  return ae?.getAttribute("data-role") === "add-node";
});
console.log("empty board: initial focus on +add ->", initialOnAdd);

// Create two cards in the first lane.
await page.keyboard.press("Enter"); // +add Enter triggers click
await page.waitForTimeout(300);
await page.keyboard.type("alpha");
await page.waitForTimeout(200);
await page.keyboard.press("Enter"); // confirm and leave edit mode
await page.waitForTimeout(200);

// The card focus mode handler creates a sibling via M-Enter — let's
// instead use the +add button approach again. After Enter (leave edit),
// focus is on the card. Press ArrowDown to navigate to +add, then Enter
// to create another.
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(100);
const onAddAfterDown = await page.evaluate(() => {
  return document.activeElement?.getAttribute("data-role") === "add-node";
});
console.log("ArrowDown from last card lands on +add ->", onAddAfterDown);

await page.keyboard.press("Enter"); // adds a new card, focuses editor
await page.waitForTimeout(300);
await page.keyboard.type("beta");
await page.waitForTimeout(100);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

// Now go down to +add, then up to last card (beta).
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(100);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(100);
const upFromAdd = await page.evaluate(() => {
  const ae = document.activeElement as HTMLElement | null;
  return ae?.textContent?.trim() ?? null;
});
console.log("ArrowUp from +add lands on card -> '", upFromAdd, "'");

// ArrowDown to +add, ArrowRight to next lane.
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(100);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(100);
const rightFromAdd = await page.evaluate(() => {
  const ae = document.activeElement as HTMLElement | null;
  // Find the lane section of activeElement
  const section = ae?.closest("section[data-lane-id]") as HTMLElement | null;
  return {
    role: ae?.getAttribute("data-role"),
    laneName: section?.querySelector("h2")?.textContent ?? section?.textContent?.slice(0, 30) ?? null,
  };
});
console.log("ArrowRight from +add ->", rightFromAdd);

const allPass =
  initialOnAdd &&
  onAddAfterDown &&
  (upFromAdd?.includes("beta") ?? false) &&
  rightFromAdd.laneName !== null &&
  errors.length === 0;

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
console.log(`result: ${allPass ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(allPass ? 0 : 1);
