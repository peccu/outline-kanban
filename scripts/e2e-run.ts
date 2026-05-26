/**
 * e2e test runner — starts a dedicated server with a test DB so e2e scripts
 * never touch the development database.
 *
 * Usage:
 *   bun run test:e2e                        # run all suites
 *   bun run test:e2e e2e-smoke e2e-lanes    # run specific suites
 */
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

const TEST_API_PORT = 8789;
const TEST_APP_PORT = 8790;
const TEST_DB = "outline-kanban-test.sqlite";

const root = resolve(import.meta.dir, "..");

function discoverSuites(): string[] {
  return readdirSync(resolve(root, "scripts"))
    .filter((f) => f.startsWith("e2e-") && f.endsWith(".ts") && f !== "e2e-run.ts")
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

async function waitForReady(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const apiServer = Bun.spawn(["bun", "run", "--watch=false", "server/index.ts"], {
  cwd: root,
  env: {
    ...process.env,
    DB_PATH: TEST_DB,
    PORT: String(TEST_API_PORT),
    NODE_ENV: "development",
  },
  stdout: "pipe",
  stderr: "pipe",
});

const viteServer = Bun.spawn(
  ["bunx", "vite", "--config", "client/vite.config.ts"],
  {
    cwd: root,
    env: {
      ...process.env,
      E2E_API_TARGET: `http://localhost:${TEST_API_PORT}`,
      E2E_APP_PORT: String(TEST_APP_PORT),
    },
    stdout: "pipe",
    stderr: "pipe",
  }
);

function cleanup() {
  apiServer.kill();
  viteServer.kill();
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

console.log(`[e2e-run] API  → http://localhost:${TEST_API_PORT}  (DB: ${TEST_DB})`);
console.log(`[e2e-run] App  → http://localhost:${TEST_APP_PORT}`);
console.log("[e2e-run] waiting for servers to be ready...");

await Promise.all([
  waitForReady(`http://localhost:${TEST_API_PORT}/api/lanes`),
  waitForReady(`http://localhost:${TEST_APP_PORT}`),
]);
console.log("[e2e-run] servers ready\n");

const suites = process.argv.slice(2).length ? process.argv.slice(2) : discoverSuites();
console.log(`[e2e-run] suites: ${suites.join(", ")}\n`);

const results: { name: string; code: number }[] = [];

for (const name of suites) {
  const scriptPath = resolve(root, "scripts", `${name}.ts`);
  console.log(`──── ${name} ────`);
  const proc = Bun.spawn(["bun", "run", scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      APP_URL: `http://localhost:${TEST_APP_PORT}`,
      API_URL: `http://localhost:${TEST_API_PORT}`,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  results.push({ name, code });
  console.log(`[e2e-run] ${name}: ${code === 0 ? "PASS" : `FAIL (exit ${code})`}\n`);
}

cleanup();

const passed = results.filter((r) => r.code === 0).length;
const failed = results.filter((r) => r.code !== 0).length;
console.log(`[e2e-run] ${passed} passed, ${failed} failed`);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const rows = results
    .map((r) => `| ${r.name} | ${r.code === 0 ? "✅ pass" : "❌ fail"} |`)
    .join("\n");
  const md = [
    `## E2E results — ${passed} passed, ${failed} failed`,
    "",
    "| Suite | Result |",
    "| --- | --- |",
    rows,
  ].join("\n");
  await Bun.write(summaryFile, md + "\n");
}

process.exit(failed > 0 ? 1 : 0);
