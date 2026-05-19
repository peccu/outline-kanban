import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new OpenAPIHono();

app.use("*", logger());
app.use("/api/*", cors({ origin: "*" }));

const HealthResponse = z
  .object({
    status: z.literal("ok"),
    uptime: z.number().describe("Process uptime in seconds"),
  })
  .openapi("HealthResponse");

app.openapi(
  createRoute({
    method: "get",
    path: "/api/health",
    tags: ["meta"],
    summary: "Liveness probe",
    responses: {
      200: {
        description: "Service is healthy",
        content: { "application/json": { schema: HealthResponse } },
      },
    },
  }),
  (c) =>
    c.json({
      status: "ok" as const,
      uptime: process.uptime(),
    }),
);

app.doc("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "outline-kanban API",
    version: "0.0.1",
    description: "Personal outliner-style Kanban backend.",
  },
});

app.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

const port = Number(process.env.PORT ?? 5173);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[server] listening on http://localhost:${port}`);
console.log(`[server] swagger UI:  http://localhost:${port}/docs`);
