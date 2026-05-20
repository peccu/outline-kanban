import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:8788";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

// Reset DB state first so prior test runs don't pollute counts.
async function resetData() {
  const lanes = await fetch(`${API_URL}/api/lanes`).then((r) => r.json());
  const allNodes = await fetch(`${API_URL}/api/nodes`).then((r) => r.json());
  for (const n of allNodes as any[]) {
    if (!n.parentId) continue;
    // skip children, parents will cascade
  }
  for (const n of allNodes as any[]) {
    if (n.parentId === null) {
      await fetch(`${API_URL}/api/nodes/${n.id}`, { method: "DELETE" });
    }
  }
  void lanes;
}
await resetData();

const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP_URL);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const todayLane = page
  .locator("section", { has: page.getByText("Today", { exact: true }) })
  .first();

// Use Alt as the M- modifier across platforms (Cmd would collide with browser nav).
const M = "Alt";

async function dumpRoots() {
  const r = await fetch(`${API_URL}/api/nodes`).then((x) => x.json());
  return (r as Array<any>).map((n) => ({
    title: n.title,
    parent: n.parentId,
    lane: n.laneId,
  }));
}

// 1) Add a root, then Enter -- Enter must NOT create a sibling.
await todayLane.locator('button[data-role="add-node"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("alpha");
await page.waitForTimeout(200);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);

let nodes = await dumpRoots();
const afterPlainEnter = nodes.length;
console.log("nodes after plain Enter (should still be 1):", afterPlainEnter);

// 2) M-Enter should add a sibling.
await page.keyboard.press(`${M}+Enter`);
await page.waitForTimeout(500);
await page.keyboard.type("beta");
await page.waitForTimeout(300);

nodes = await dumpRoots();
const afterModEnter = nodes.length;
console.log("nodes after M-Enter (should be 2):", afterModEnter);

// 3) M-Right should indent beta under alpha.
await page.keyboard.press(`${M}+ArrowRight`);
await page.waitForTimeout(500);

nodes = await dumpRoots();
const beta = nodes.find((n) => n.title === "beta");
const alpha = nodes.find((n) => n.title === "alpha");
const indentedViaModRight = beta?.parent === alpha?.parent
  ? false
  : beta?.parent === (alpha as any)?.parent || beta?.parent !== null;
const betaIndented = !!beta && beta.parent !== null;
console.log("beta indented after M-Right:", betaIndented);

// 4) M-Left should outdent beta back.
await page.keyboard.press(`${M}+ArrowLeft`);
await page.waitForTimeout(500);

nodes = await dumpRoots();
const beta2 = nodes.find((n) => n.title === "beta");
const betaOutdented = !!beta2 && beta2.parent === null;
console.log("beta outdented after M-Left:", betaOutdented);

// 5) Tab cycle: press Tab repeatedly on beta. Expected positions
//    step0 indent → step1 origin → step2 top → step3 parent's level → loop
//    Since beta's parent (origin) is already top-level, step3 = top.
console.log("\n--- Tab cycle ---");
const cyclePositions: string[] = [];

async function snapshotBeta() {
  const ns = await dumpRoots();
  const b = ns.find((n) => n.title === "beta");
  return b ? `parent=${b.parent ? "set" : "null"}` : "missing";
}

cyclePositions.push("start " + (await snapshotBeta()));

await page.keyboard.press("Tab");
await page.waitForTimeout(500);
cyclePositions.push("after Tab #1 " + (await snapshotBeta()));

await page.keyboard.press("Tab");
await page.waitForTimeout(500);
cyclePositions.push("after Tab #2 " + (await snapshotBeta()));

await page.keyboard.press("Tab");
await page.waitForTimeout(500);
cyclePositions.push("after Tab #3 " + (await snapshotBeta()));

await page.keyboard.press("Tab");
await page.waitForTimeout(500);
cyclePositions.push("after Tab #4 " + (await snapshotBeta()));

await page.keyboard.press("Tab");
await page.waitForTimeout(500);
cyclePositions.push("after Tab #5 " + (await snapshotBeta()));

for (const p of cyclePositions) console.log(" ", p);

// 6) Typing resets cycle: after a few cycles, typing a char then Tab should
//    indent again (step 0), not jump to the next cycle position.
console.log("\n--- typing resets cycle ---");
// Get beta back to root first
await page.keyboard.press(`${M}+ArrowLeft`);
await page.waitForTimeout(500);
// Find beta's id so we can track it through title edits.
const betaSnap = (await dumpRoots()).find((n) => n.title === "beta") as any;
const betaId: string | undefined = (await fetch(`${API_URL}/api/nodes`)
  .then((r) => r.json()) as any[]).find((n: any) => n.title === "beta")?.id;
console.log("beta id:", betaId);

async function getNodeById(id: string) {
  const all = (await fetch(`${API_URL}/api/nodes`).then((r) => r.json())) as any[];
  return all.find((n) => n.id === id);
}

// Tab #1 (step 0 indent)
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
const afterTab1 = betaId ? await getNodeById(betaId) : null;
const tab1Indented = !!afterTab1 && afterTab1.parentId !== null;
console.log("after Tab #1 (should indent):", tab1Indented);

// Type a char → resets cycle
await page.keyboard.press("z");
await page.waitForTimeout(400);

// Outdent back to root manually
await page.keyboard.press(`${M}+ArrowLeft`);
await page.waitForTimeout(500);
const afterReset = betaId ? await getNodeById(betaId) : null;
console.log("after typing+M-Left (should be root):", afterReset?.parentId === null);

// Tab again — should be step 0 (indent), NOT continue to step 2/3
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
const afterTabAfterReset = betaId ? await getNodeById(betaId) : null;
const cycleResetCorrectly = !!afterTabAfterReset && afterTabAfterReset.parentId !== null;
console.log("after Tab post-typing (should indent again):", cycleResetCorrectly);
void betaSnap;

await page.screenshot({ path: "/tmp/keymap-final.png", fullPage: true });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(e);

await browser.close();

// Verify Tab cycle observed positions matched expectation.
// cyclePositions[0] = start, then Tab #1..#5
// Expected (origin at root): start=null, set, null, null, null, set
const cycleOk =
  cyclePositions[0]?.endsWith("parent=null") &&
  cyclePositions[1]?.endsWith("parent=set") &&
  cyclePositions[2]?.endsWith("parent=null") &&
  cyclePositions[3]?.endsWith("parent=null") &&
  cyclePositions[4]?.endsWith("parent=null") &&
  cyclePositions[5]?.endsWith("parent=set");

const ok =
  afterPlainEnter === 1 &&
  afterModEnter === 2 &&
  betaIndented &&
  betaOutdented &&
  cycleOk &&
  tab1Indented &&
  cycleResetCorrectly &&
  errors.length === 0;
console.log(`\nresult: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
