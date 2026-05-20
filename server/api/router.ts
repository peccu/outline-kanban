import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { attachmentsRouter } from "./routes/attachments";
import { commentsRouter } from "./routes/comments";
import { lanesRouter } from "./routes/lanes";
import { nodesRouter } from "./routes/nodes";
import { tagsRouter } from "./routes/tags";
import { jsonContent } from "./schemas";

const HealthResponse = z
  .object({
    status: z.literal("ok"),
    uptime: z.number().describe("Process uptime in seconds"),
  })
  .openapi("HealthResponse");

export const apiRouter = new OpenAPIHono();

apiRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["meta"],
    summary: "Liveness probe",
    responses: {
      200: { description: "ok", content: jsonContent(HealthResponse) },
    },
  }),
  (c) =>
    c.json(
      {
        status: "ok" as const,
        uptime: process.uptime(),
      },
      200,
    ),
);

apiRouter.route("/lanes", lanesRouter);
apiRouter.route("/nodes", nodesRouter);
apiRouter.route("/tags", tagsRouter);
apiRouter.route("/", commentsRouter);
apiRouter.route("/", attachmentsRouter);
