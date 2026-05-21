// Verify the detail modal traps Tab focus inside itself.
//   - Open the modal.
//   - Tab N times (with N > the number of focusable elements) and at
//     each step assert the active element is inside the modal.
//   - Shift+Tab from the first focusable wraps to the last.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("trap me");
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);

async function activeIsInModal(): Promise<boolean> {
  return await page.evaluate(() => {
    const modal = document.querySelector(".max-w-2xl");
    return !!modal && !!document.activeElement && modal.contains(document.activeElement);
  });
}

const initial = await activeIsInModal();
console.log("focus starts inside modal:", initial);

// Tab through many times — more than the modal could possibly hold.
const trapped: boolean[] = [];
for (let i = 0; i < 25; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(40);
  trapped.push(await activeIsInModal());
}
const allTrapped = trapped.every(Boolean);
console.log("focus stayed in modal across 25 Tabs:", allTrapped);

// Now Shift+Tab a bunch — same constraint.
const trappedBack: boolean[] = [];
for (let i = 0; i < 25; i++) {
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(40);
  trappedBack.push(await activeIsInModal());
}
const allTrappedBack = trappedBack.every(Boolean);
console.log("focus stayed in modal across 25 Shift+Tabs:", allTrappedBack);

const ok = initial && allTrapped && allTrappedBack && errs.length === 0;
console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
