// Rasterize the SVG icons under client/public/icons into PNGs at the sizes
// expected by PWA / iOS / Android home-screen installs. Run with:
//   bun run scripts/gen-icons.ts
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const iconsDir = join(root, "client/public/icons");

type Target = { svg: string; out: string; size: number };

const targets: Target[] = [
  { svg: "icon.svg", out: "icon-192.png", size: 192 },
  { svg: "icon.svg", out: "icon-512.png", size: 512 },
  { svg: "icon.svg", out: "apple-touch-icon.png", size: 180 },
  { svg: "icon-maskable.svg", out: "icon-maskable-192.png", size: 192 },
  { svg: "icon-maskable.svg", out: "icon-maskable-512.png", size: 512 },
  { svg: "icon.svg", out: "favicon-32.png", size: 32 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

for (const t of targets) {
  const svg = readFileSync(join(iconsDir, t.svg), "utf8");
  const html = `<!doctype html><html><head><style>
      html,body{margin:0;padding:0;background:transparent}
      svg{display:block;width:${t.size}px;height:${t.size}px}
    </style></head><body>${svg}</body></html>`;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(html, { waitUntil: "load" });
  const el = await page.$("svg");
  if (!el) throw new Error(`svg not found in ${t.svg}`);
  await el.screenshot({
    path: join(iconsDir, t.out),
    omitBackground: true,
    type: "png",
  });
  console.log(`wrote icons/${t.out} (${t.size}x${t.size})`);
}

await browser.close();
