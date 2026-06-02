// Regression test for the "kanban eats a character" bug: a save round-trip
// must not clobber the editor while the user keeps typing.
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";

const errors: string[] = [];
const failures: string[] = [];
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();

await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);

const PART1 = "hello";
const PART2 = " brave new world";
const EXPECTED = PART1 + PART2;

// Type the first part, then wait long enough for the debounced save (400ms)
// to fire AND its PATCH round-trip + node-query invalidation to complete.
await page.keyboard.type(PART1, { delay: 40 });
await page.waitForTimeout(1200);
// Now keep typing — the in-flight refetch must not reset the editor under us.
await page.keyboard.type(PART2, { delay: 40 });
await page.waitForTimeout(1200);

// Read the *focused* editor (the card we just created) — the test DB may
// already hold other cards, so a positional selector is unreliable.
const editorText = await page.evaluate(() => {
  const el = document.activeElement;
  const pm = el?.closest?.(".ProseMirror") ?? el?.querySelector?.(".ProseMirror");
  return (pm as HTMLElement | null)?.innerText ?? "";
});
check(
  "all typed characters retained",
  editorText.trim() === EXPECTED,
  `got "${editorText.trim()}"`,
);

// Reload and confirm it persisted correctly too.
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
const afterReload = await todayLane
  .locator(`.ProseMirror:has-text("${PART1}")`)
  .first()
  .innerText();
check(
  "persisted text correct after reload",
  afterReload.trim() === EXPECTED,
  `got "${afterReload.trim()}"`,
);

await page.screenshot({ path: "/tmp/card-input.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);

const ok = failures.length === 0 && errors.length === 0;
console.log(ok ? "\nPASS" : `\nFAIL (${failures.length} checks failed)`);
await browser.close();
process.exit(ok ? 0 : 1);
