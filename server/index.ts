import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { apiRouter } from "./api/router";
import { db } from "./db/client";
import { seedDefaultLanesIfEmpty } from "./db/seed";

const isProd = process.env.NODE_ENV === "production";
const migrationsDir = isProd
  ? "./server/db/migrations"
  : "./server/db/migrations";

migrate(db, { migrationsFolder: migrationsDir });
await seedDefaultLanesIfEmpty();

const app = new OpenAPIHono();

app.use("*", logger());
app.use("/api/*", cors({ origin: "*" }));

app.route("/api", apiRouter);

app.doc("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "outline-kanban API",
    version: "0.0.1",
    description: "Personal outliner-style Kanban backend.",
  },
});

app.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

// In production, serve the built Vite client. In dev the Vite server handles
// this through its proxy, so we skip mounting static handlers.
if (isProd) {
  const distDir = "./client/dist";
  app.get("*", async (c) => {
    const url = new URL(c.req.url);
    if (url.pathname.startsWith("/api/")) return c.notFound();

    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(distDir, rel);

    if (existsSync(filePath)) {
      const file = Bun.file(filePath);
      return new Response(file);
    }
    // SPA fallback
    return new Response(Bun.file(join(distDir, "index.html")), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

const port = Number(process.env.PORT ?? 8787);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[server] listening on http://localhost:${port}`);
console.log(`[server] swagger UI:  http://localhost:${port}/docs`);
