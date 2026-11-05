// Verify unsaved description edits survive blur / closing the modal / reload,
// and that saving clears the stored draft.
//   1. Edit the description, blur, close the modal (backdrop), reload, reopen
//      → textarea is open with the unsaved text; server still has the old body.
//   2. A background refetch (window focus) doesn't clobber the unsaved text.
//   3. Esc saves → server has the new body and the draft is gone.
// Defaults target the `bun run dev` ports (never the Docker container on 8787).
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:9788";
const API_URL = process.env.API_URL ?? "http://localhost:9787";

const json = (r: Response) => r.json() as Promise<any>;
const lanes = (await fetch(`${API_URL}/api/lanes`).then(json)) as any[];
const card = await fetch(`${API_URL}/api/nodes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ parentId: null, laneId: lanes[0].id, title: "desc draft card" }),
}).then(json);
await fetch(`${API_URL}/api/nodes/${card.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ bodyMd: "saved body" }),
});
const serverBody = async () =>
  ((await fetch(`${API_URL}/api/nodes/${card.id}`).then(json)) as any).bodyMd;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  checks.push([name, ok]);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
};

const bodyTa = page.locator('textarea[placeholder="add details…"]');
const bodyView = page.locator('[aria-label^="description (double-click"]');
async function openCard() {
  await page.locator(`[data-card-node-id="${card.id}"]`).click();
  await page.getByRole("button", { name: "close", exact: true }).waitFor();
  await page.waitForTimeout(300);
}

try {
  await page.goto(APP_URL);
  await page.waitForLoadState("networkidle");
  await openCard();
  await bodyView.dblclick();
  await bodyTa.fill("saved body\n\nunsaved addition");
  // Blur (focus out) then close via the close button.
  await page.locator('input[placeholder="add a subtask…"]').focus();
  await page.waitForTimeout(100);
  check("blur keeps the edit in the textarea", (await bodyTa.inputValue()).includes("unsaved addition"));
  await page.getByRole("button", { name: "close", exact: true }).click();
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openCard();
  check(
    "draft restored in edit mode after close + reload",
    (await bodyTa.count()) === 1 && (await bodyTa.inputValue()) === "saved body\n\nunsaved addition",
  );
  check("server body untouched", (await serverBody()) === "saved body");

  // Background refetch must not overwrite unsaved text.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(500);
  check("refetch doesn't clobber the draft", (await bodyTa.inputValue()).includes("unsaved addition"));

  await bodyTa.focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const drafts = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes("draft:body:")),
  );
  check("Esc saves to server", (await serverBody()) === "saved body\n\nunsaved addition");
  check("saving clears the draft", drafts.length === 0);
} finally {
  await fetch(`${API_URL}/api/nodes/${card.id}`, { method: "DELETE" });
  console.log(`\npage errors: ${errs.length}`);
  for (const e of errs) console.log(e);
  await browser.close();
}
const ok = errs.length === 0 && checks.every(([, v]) => v);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
