import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { apiRouter } from "./api/router";
import { seedDefaultLanesIfEmpty } from "./db/seed";

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

await seedDefaultLanesIfEmpty();

const port = Number(process.env.PORT ?? 5173);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[server] listening on http://localhost:${port}`);
console.log(`[server] swagger UI:  http://localhost:${port}/docs`);
