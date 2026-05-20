// Verify that the PWA manifest is reachable, the icons resolve, and the
// service worker registers when served from the production server.
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:5193";

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "allow" });
const page = await ctx.newPage();

const fails: string[] = [];
page.on("requestfailed", (r) => {
  fails.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText}`);
});
page.on("response", async (res) => {
  if (res.status() >= 400) fails.push(`${res.status()} ${res.url()}`);
});

await page.goto(base, { waitUntil: "load" });

// Read the manifest link target.
const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute("href");
console.log("manifest href:", manifestHref);

const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute("content");
console.log("theme-color:", themeColor);

// Fetch & parse the manifest itself, then verify every icon URL responds 200.
const manifest = await page.evaluate(async (href) => {
  const res = await fetch(href!);
  return { status: res.status, body: await res.json() };
}, manifestHref);
console.log("manifest status:", manifest.status);
console.log("manifest icons:", manifest.body.icons.length);

const iconChecks = await page.evaluate(async (icons: { src: string }[]) => {
  const out: { src: string; status: number }[] = [];
  for (const ic of icons) {
    const res = await fetch(ic.src, { method: "GET" });
    out.push({ src: ic.src, status: res.status });
  }
  return out;
}, manifest.body.icons);
for (const c of iconChecks) console.log("icon:", c.status, c.src);

// Wait for service-worker registration.
const swActive = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "no-api";
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.scriptURL ?? "no-active";
});
console.log("service worker:", swActive);

await browser.close();

const ok =
  manifest.status === 200 &&
  manifest.body.icons.length >= 3 &&
  iconChecks.every((c) => c.status === 200) &&
  swActive !== "no-api" &&
  swActive !== "no-active";

if (fails.length) {
  console.log("network failures:");
  for (const f of fails) console.log(" -", f);
}

if (!ok) {
  console.error("PWA verification FAILED");
  process.exit(1);
}
console.log("PWA verification OK");
