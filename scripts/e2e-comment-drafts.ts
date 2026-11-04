// Verify the comment ordering + unsent-text persistence in the detail modal:
//   1. Comments are listed newest first, with the composer above the list.
//   2. Unsent text (new comment, an in-progress comment edit, the subtask
//      input) survives closing the modal + reloading the page.
//   3. The comment edit textarea is tall (≥ 3× the old 4rem).
//   4. Discarding a dirty comment edit asks first: dismiss keeps the edit and
//      the modal open (Esc), accept drops it (cancel button).
//   5. Posting clears the composer and its stored draft.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

const json = (r: Response) => r.json() as Promise<any>;
const post = (path: string, body: unknown) =>
  fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(json);

// Reset + seed: one card with two comments, created in order.
const all = (await fetch(`${API_URL}/api/nodes`).then(json)) as any[];
for (const n of all) {
  if (n.parentId === null) await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
}
const lanes = (await fetch(`${API_URL}/api/lanes`).then(json)) as any[];
const card = await post("/api/nodes", {
  parentId: null,
  laneId: lanes[0].id,
  title: "draft card",
});
await post(`/api/nodes/${card.id}/comments`, { bodyMd: "older comment" });
await Bun.sleep(1100); // createdAt has second resolution in some paths
await post(`/api/nodes/${card.id}/comments`, { bodyMd: "newer comment" });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(e.message));
let dialogAnswer: "accept" | "dismiss" = "accept";
let dialogs = 0;
page.on("dialog", (d) => {
  dialogs++;
  void (dialogAnswer === "accept" ? d.accept() : d.dismiss());
});

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  checks.push([name, ok]);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
};

const composer = page.locator('textarea[placeholder="add a comment…"]');
const editTa = page.locator('textarea[placeholder="edit comment…"]');
const subtaskInput = page.locator('input[placeholder="add a subtask…"]');

async function openCard() {
  await page.locator(`[data-card-node-id="${card.id}"]`).click();
  await composer.waitFor();
  await page.waitForTimeout(300);
}
async function commentTexts() {
  return page.$$eval("li[tabindex]", (lis) =>
    lis
      .map((li) => li.querySelector(".md")?.textContent?.trim() ?? "")
      .filter(Boolean),
  );
}

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.evaluate(() => localStorage.clear());
await openCard();

// 1. Order + composer position.
check(
  "comments newest first",
  JSON.stringify(await commentTexts()) ===
    JSON.stringify(["newer comment", "older comment"]),
);
check(
  "composer is above the comment list",
  await page.evaluate(() => {
    const ta = document.querySelector('textarea[placeholder="add a comment…"]')!;
    const li = document.querySelector("li[tabindex]")!;
    return !!(ta.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING);
  }),
);

// 2. Leave unsent text everywhere, then close + reload.
await composer.fill("unsent comment");
await subtaskInput.fill("unsent subtask");
await page
  .locator("li[tabindex]", { hasText: "newer comment" })
  .getByRole("button", { name: /edit/ })
  .click();
await editTa.fill("newer comment EDITED");
await page.getByRole("button", { name: "close", exact: true }).click();
await page.waitForTimeout(200);
await page.reload();
await page.waitForLoadState("networkidle");
await openCard();

check("new-comment draft restored", (await composer.inputValue()) === "unsent comment");
check("subtask draft restored", (await subtaskInput.inputValue()) === "unsent subtask");
check(
  "comment edit reopened with its draft",
  (await editTa.count()) === 1 && (await editTa.inputValue()) === "newer comment EDITED",
);

// 3. Edit textarea height (old min-height was 4rem = 64px).
const h = (await editTa.boundingBox())?.height ?? 0;
check(`edit textarea is tall (${h}px ≥ 192px)`, h >= 192);

// 4a. Esc on a dirty edit → confirm; dismiss keeps edit + modal.
dialogAnswer = "dismiss";
dialogs = 0;
await editTa.focus();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check(
  "Esc asks, dismiss keeps the edit and the modal",
  dialogs === 1 &&
    (await editTa.count()) === 1 &&
    (await page.getByRole("button", { name: "close", exact: true }).count()) === 1,
);

// 4b. cancel button → confirm; accept drops the edit and its draft.
dialogAnswer = "accept";
dialogs = 0;
await page.getByRole("button", { name: "cancel", exact: true }).click();
await page.waitForTimeout(200);
const editDrafts = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.includes("comment:edit:")),
);
const stored = (await fetch(`${API_URL}/api/nodes/${card.id}/comments`).then(json)) as any[];
check(
  "cancel asks, accept discards the edit + draft",
  dialogs === 1 &&
    (await editTa.count()) === 0 &&
    editDrafts.length === 0 &&
    stored.some((c) => c.bodyMd === "newer comment"),
);

// 5. Posting clears the composer + its draft; the new comment lands on top.
await page.getByRole("button", { name: "post", exact: true }).click();
await page.waitForTimeout(600);
const newDrafts = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.includes("comment:new:")),
);
check(
  "post clears composer + draft",
  (await composer.inputValue()) === "" && newDrafts.length === 0,
);
check("posted comment is first", (await commentTexts())[0] === "unsent comment");

console.log(`\npage errors: ${errs.length}`);
for (const e of errs) console.log(e);
const ok = errs.length === 0 && checks.every(([, v]) => v);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
