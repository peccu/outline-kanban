// Lightweight log-level controller for the server. Replaces hono/logger,
// which is fixed at "log every request on two lines". Honors the
// LOG_LEVEL env var (debug | info | warn | error | silent), defaulting
// to "info".

import type { MiddlewareHandler } from "hono";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw in RANK) return raw as LogLevel;
  console.warn(`[log] unknown LOG_LEVEL=${raw}, falling back to "info"`);
  return "info";
}

const threshold = RANK[resolveLevel()];

export function shouldLog(level: LogLevel): boolean {
  return RANK[level] >= threshold;
}

export const log = {
  debug: (...a: unknown[]) => shouldLog("debug") && console.log("[debug]", ...a),
  info: (...a: unknown[]) => shouldLog("info") && console.log(...a),
  warn: (...a: unknown[]) => shouldLog("warn") && console.warn(...a),
  error: (...a: unknown[]) => shouldLog("error") && console.error(...a),
};

// One-line HTTP request logger. Status >= 500 logs at error, >= 400 at
// warn, otherwise info — so a quieter LOG_LEVEL still surfaces problems.
export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const status = c.res.status;
    const level: LogLevel =
      status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    if (!shouldLog(level)) return;
    const elapsed = (performance.now() - start).toFixed(1);
    const line = `${c.req.method} ${c.req.path} ${status} ${elapsed}ms`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}
