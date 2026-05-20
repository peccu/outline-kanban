// Verify:
//   1. Dropping a file onto the description textarea uploads it and
//      inserts a Markdown image reference at the caret.
//   2. Pasting an image into the comment textarea uploads and inserts
//      the same way.
//   3. The /api/attachments/{id} endpoint serves the right bytes.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

// 71-byte 1x1 magenta PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8DAAAAHAAGC5xKdAAAAAElFTkSuQmCC";

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

// Create a card and open the modal.
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.type("attach me");
await page.keyboard.press("Enter");
await page.waitForTimeout(150);

await page.locator("[data-card-node-id]").first().click();
await page.waitForTimeout(500);

// 1. Drop a file onto the description textarea.
const descTa = page.locator('textarea[placeholder="add details…"]');
await descTa.waitFor();
const dropResult = await page.evaluate(
  async ({ b64 }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "dropped.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ta = document.querySelector(
      'textarea[placeholder="add details…"]',
    ) as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt, cancelable: true }));
    ta.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt, cancelable: true }));
    // Wait briefly for the upload to round-trip.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (/\!\[.*?\]\(\/api\/attachments\/[0-9a-f-]+\)/.test(ta.value)) {
        return { value: ta.value };
      }
    }
    return { value: ta.value, error: "no markdown ref appeared" };
  },
  { b64: TINY_PNG_B64 },
);
console.log("description value after drop:", dropResult.value);
const dropMatched = /!\[.*?\]\(\/api\/attachments\/([0-9a-f-]+)\)/.exec(
  dropResult.value,
);
const droppedId = dropMatched?.[1] ?? null;
console.log("uploaded attachment id (drop):", droppedId);

// Verify the bytes round-trip.
let dropBytesOk = false;
if (droppedId) {
  const res = await fetch(`${API_URL}/api/attachments/${droppedId}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Original PNG length should match (71 bytes).
  const expectedLen = atob(TINY_PNG_B64).length;
  dropBytesOk = res.status === 200 && buf.length === expectedLen;
  console.log("downloaded bytes:", buf.length, "expected:", expectedLen);
}

// 2. Paste the same image into the new-comment textarea.
const commentTa = page.locator('textarea[placeholder="add a comment…"]');
await commentTa.click();
await page.waitForTimeout(100);
const pasteResult = await page.evaluate(
  async ({ b64 }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "", { type: "image/png" }); // clipboard files have empty names
    const dt = new DataTransfer();
    dt.items.add(file);
    const ta = document.querySelector(
      'textarea[placeholder="add a comment…"]',
    ) as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
    );
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (/\!\[.*?\]\(\/api\/attachments\/[0-9a-f-]+\)/.test(ta.value)) {
        return { value: ta.value };
      }
    }
    return { value: ta.value, error: "no markdown ref appeared" };
  },
  { b64: TINY_PNG_B64 },
);
console.log("comment value after paste:", pasteResult.value);
const pasteMatched = /!\[.*?\]\(\/api\/attachments\/([0-9a-f-]+)\)/.exec(
  pasteResult.value,
);
const pastedId = pasteMatched?.[1] ?? null;
console.log("uploaded attachment id (paste):", pastedId);

const allOk =
  !!droppedId &&
  dropBytesOk &&
  !!pastedId &&
  pastedId !== droppedId && // different uploads → different ids
  errs.length === 0;

console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
console.log(`result: ${allOk ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(allOk ? 0 : 1);
