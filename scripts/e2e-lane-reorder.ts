// Verify lane reorder via:
//   1. Focus a lane header + press Shift+Right → lane swaps with the
//      lane to its right.
//   2. Drag a lane header onto another position → indicator shows,
//      drop reorders.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

async function lanesInOrder(): Promise<string[]> {
  const res = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
  return res.map((l) => l.name);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

const initial = await lanesInOrder();
console.log("initial order:", initial);
if (initial.length < 3) throw new Error("need >= 3 lanes for this test");

// --- 1. keyboard: focus first lane's header, Shift+Right.
await page.evaluate(() => {
  const h = document.querySelector<HTMLElement>("[data-lane-header-id]");
  h?.focus();
});
await page.waitForTimeout(100);
await page.keyboard.press("Shift+ArrowRight");
await page.waitForTimeout(400);

const afterKbd = await lanesInOrder();
console.log("after Shift+Right on first:", afterKbd);
const kbdOk =
  afterKbd[0] === initial[1] && afterKbd[1] === initial[0];

// --- 2. DnD: take what's now lane[2] and drop it before lane[0].
const draggedLaneName = afterKbd[2]!;
const targetLaneName = afterKbd[0]!;

await page.evaluate(
  async ({ draggedLaneName, targetLaneName }) => {
    const headers = Array.from(
      document.querySelectorAll<HTMLElement>("[data-lane-header-id]"),
    );
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-lane-id]"),
    );
    const srcHeader = headers.find((h) =>
      h.textContent?.includes(draggedLaneName.toUpperCase()) ||
      h.textContent?.toUpperCase().includes(draggedLaneName.toUpperCase()),
    );
    const targetSection = sections.find((s) =>
      s.textContent?.toUpperCase().includes(targetLaneName.toUpperCase()),
    );
    if (!srcHeader || !targetSection) throw new Error("locator setup failed");
    const targetRect = targetSection.getBoundingClientRect();
    const dropX = targetRect.left + 4; // just inside the left edge
    const dropY = targetRect.top + targetRect.height / 2;
    const boardEl = sections[0]!.parentElement as HTMLElement;
    const dt = new DataTransfer();
    srcHeader.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }),
    );
    dt.setData("application/x-lane-id", srcHeader.dataset.laneHeaderId!);
    boardEl.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        dataTransfer: dt,
        clientX: dropX,
        clientY: dropY,
        cancelable: true,
      }),
    );
    // Give Vue a frame to render the indicator before we snapshot.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 50));
    (window as any).__laneIndicator =
      !!document.querySelector('[data-role="lane-drop-indicator"]');
    boardEl.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        dataTransfer: dt,
        clientX: dropX,
        clientY: dropY,
        cancelable: true,
      }),
    );
    srcHeader.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
  },
  { draggedLaneName, targetLaneName },
);
await page.waitForTimeout(500);

const indicatorShown = await page.evaluate(() => (window as any).__laneIndicator);
console.log("lane drop indicator visible during drag:", indicatorShown);

const afterDnd = await lanesInOrder();
console.log("after DnD:", afterDnd);

const dndOk =
  afterDnd[0] === draggedLaneName &&
  afterDnd.includes(targetLaneName);

const ok = kbdOk && indicatorShown && dndOk && errs.length === 0;

// Restore the original lane order so later e2e suites that depend on the
// seed sequence (e.g. e2e-card-focus's left/right traversal) keep working.
// We reorder from the back so each placement isn't clobbered by the next.
{
  const lanes = (await fetch(`${API_URL}/api/lanes`).then((r) => r.json())) as any[];
  const byName = Object.fromEntries(lanes.map((l: any) => [l.name, l.id]));
  const ids = initial.map((n) => byName[n]).filter(Boolean);
  for (let i = ids.length - 1; i >= 0; i--) {
    const beforeLaneId = ids[i + 1] ?? null;
    await fetch(`${API_URL}/api/lanes/${ids[i]}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beforeLaneId }),
    });
  }
}

console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
