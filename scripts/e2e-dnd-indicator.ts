// Verify that during a drag:
//   1. A drop indicator appears above the targeted root card.
//   2. Dropping above card N inserts before it (beforeId === N).
//   3. Dropping below all cards inserts at the end (beforeId === null).
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

async function resetData() {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  for (const n of all) {
    if (n.parentId === null) await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
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

// Create three cards in the first (Triage) lane.
for (const title of ["alpha", "beta", "gamma"]) {
  await page.keyboard.press("Enter"); // +add
  await page.waitForTimeout(150);
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  await page.keyboard.press("ArrowDown"); // back to +add
  await page.waitForTimeout(50);
}

// Helper that fires HTML5 DnD events end-to-end.
async function dragAndDrop(sourceNodeId: string, target: { x: number; y: number }) {
  await page.evaluate(
    async ({ sourceNodeId, target }) => {
      const src = document.querySelector(
        `[data-card-node-id="${sourceNodeId}"]`,
      ) as HTMLElement;
      if (!src) throw new Error("source not found");
      const drop = document.elementFromPoint(target.x, target.y) as HTMLElement;
      if (!drop) throw new Error("drop target not found at point");
      const lane = drop.closest("section[data-lane-id]") as HTMLElement | null;
      if (!lane) throw new Error("no lane at drop point");
      // The lane's dragover handler is on the inner scroll container, not
      // the <section> itself — dispatch on an element inside it so the
      // event bubbles up to where Vue listens.
      const inner =
        lane.querySelector<HTMLElement>(":scope > div.overflow-y-auto") ??
        (drop.closest(".overflow-y-auto") as HTMLElement | null) ??
        drop;

      const dt = new DataTransfer();
      const srcR = src.getBoundingClientRect();
      const fireDragOn = (el: EventTarget, type: string, x: number, y: number) =>
        el.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          } as DragEventInit),
        );

      fireDragOn(src, "dragstart", srcR.left + 5, srcR.top + 5);
      // Some browsers don't propagate the dataTransfer set in dragstart;
      // mimic the app's behaviour explicitly.
      dt.setData("application/x-node-id", src.dataset.cardNodeId ?? "");
      fireDragOn(inner, "dragenter", target.x, target.y);
      fireDragOn(inner, "dragover", target.x, target.y);
      // Let Vue's microtask flush so the indicator is rendered before drop.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // Pause briefly so a screenshot caller could capture mid-drag.
      await new Promise((r) => setTimeout(r, 150));
      // Inspect the indicator presence
      const indicator = lane.querySelector('[data-role="drop-indicator"]');
      (window as any).__lastIndicatorPresent = !!indicator;
      fireDragOn(inner, "drop", target.x, target.y);
      fireDragOn(src, "dragend", target.x, target.y);
    },
    { sourceNodeId, target },
  );
}

async function findNodeIdByTitle(title: string): Promise<string> {
  const id = await page.evaluate((t) => {
    const all = Array.from(document.querySelectorAll("[data-card-node-id]"));
    for (const el of all) {
      if ((el.textContent ?? "").includes(t)) {
        return (el as HTMLElement).dataset.cardNodeId ?? null;
      }
    }
    return null;
  }, title);
  if (!id) throw new Error(`no card with title containing "${title}"`);
  return id;
}

// Read current order in the first lane.
async function laneTitles(laneIdx = 0): Promise<string[]> {
  return await page.evaluate((i) => {
    const lanes = Array.from(document.querySelectorAll("section[data-lane-id]"));
    const lane = lanes[i] as HTMLElement;
    return Array.from(lane.querySelectorAll("[data-root-card]")).map(
      (el) => (el.textContent ?? "").trim().split("\n")[0],
    );
  }, laneIdx);
}

const before = await laneTitles();
console.log("initial order:", before);

// Move "gamma" above "alpha" by dropping near the top of alpha.
const gammaId = await findNodeIdByTitle("gamma");
const alphaCard = await page
  .locator(`[data-card-node-id="${await findNodeIdByTitle("alpha")}"]`)
  .boundingBox();
if (!alphaCard) throw new Error("alpha card not found");

await dragAndDrop(gammaId, {
  x: alphaCard.x + alphaCard.width / 2,
  y: alphaCard.y + 4,
});
await page.waitForTimeout(400);

const indicatorWasShown = await page.evaluate(() => (window as any).__lastIndicatorPresent);
console.log("indicator visible during drag:", indicatorWasShown);

const afterMove = await laneTitles();
console.log("after moving gamma above alpha:", afterMove);

// Now move "alpha" to the end (drop below the lane content).
const alphaId = await findNodeIdByTitle("alpha");
const laneBox = await page.locator("section[data-lane-id]").first().boundingBox();
if (!laneBox) throw new Error("lane box not found");

await dragAndDrop(alphaId, {
  x: laneBox.x + laneBox.width / 2,
  y: laneBox.y + laneBox.height - 30,
});
await page.waitForTimeout(400);
const afterEnd = await laneTitles();
console.log("after moving alpha to end:", afterEnd);

const ok =
  indicatorWasShown === true &&
  afterMove[0] === "gamma" &&
  afterEnd[afterEnd.length - 1] === "alpha" &&
  errors.length === 0;

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
