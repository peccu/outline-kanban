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

const today = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();
const doing = page
  .locator("section", { has: page.getByText("Doing", { exact: true }) })
  .first();

// Create one card in Today, one in Doing
await today.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("today-1");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

const afterEnterDebug = await page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return {
    tag: el?.tagName,
    cls: (el?.className?.toString() ?? "").slice(0, 80),
    hasDataCard: el?.hasAttribute?.("data-card-node-id"),
    isProseMirror: el?.classList?.contains("ProseMirror") ?? false,
    text: el?.innerText?.slice(0, 30) ?? "",
  };
});
console.log("DEBUG after Enter:", afterEnterDebug);

// After Enter, the card itself should be focused (not the editor)
const afterEnter = await page.evaluate(() => {
  const el = document.activeElement;
  return {
    isCard: el?.matches?.("[data-card-node-id]") ?? false,
    isEditor: el?.classList?.contains("ProseMirror") ?? false,
  };
});
console.log("after Enter, focus:", afterEnter);

// `o` should open the modal
await page.keyboard.press("o");
await page.waitForTimeout(400);
const modalOpen = await page
  .locator("text=description (markdown)")
  .isVisible()
  .catch(() => false);
console.log("o opens modal:", modalOpen);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Enter from card focus → focus editor again
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const editorRefocused = await page.evaluate(
  () => document.activeElement?.classList?.contains("ProseMirror") ?? false,
);
console.log("Enter from card refocuses editor:", editorRefocused);

// Confirm and add another in Doing
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await doing.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("doing-1");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

// Now card focus is on doing-1. ArrowLeft should jump to today-1.
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
const afterLeft = await page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return {
    nodeId: el?.dataset?.cardNodeId ?? null,
    text: el?.innerText?.slice(0, 30) ?? null,
  };
});
console.log("after ArrowLeft:", afterLeft);
const movedToTodayCard = (afterLeft.text ?? "").includes("today-1");
console.log("ArrowLeft jumps to Today card:", movedToTodayCard);

// ArrowRight back to Doing
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const afterRight = await page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return el?.innerText?.slice(0, 30) ?? null;
});
const movedRightToDoing = (afterRight ?? "").includes("doing-1");
console.log("ArrowRight returns to Doing card:", movedRightToDoing);

// Test description save with M-Enter
await page.keyboard.press("o");
await page.waitForTimeout(400);
const desc = page.locator('textarea[placeholder="add details…"]');
await desc.click();
await desc.fill("via M-Enter");
await page.waitForTimeout(150);
await page.keyboard.press("Alt+Enter");
await page.waitForTimeout(700);

const node = ((await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[])
  .find((n) => n.title === "doing-1");
console.log("description body after M-Enter:", JSON.stringify(node?.bodyMd));
const descSaved = node?.bodyMd === "via M-Enter";

await page.screenshot({ path: "/tmp/card-focus-final.png", fullPage: true });

await browser.close();

const ok =
  afterEnter.isCard &&
  !afterEnter.isEditor &&
  modalOpen &&
  editorRefocused &&
  movedToTodayCard &&
  movedRightToDoing &&
  descSaved &&
  errors.length === 0;

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
