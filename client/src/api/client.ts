import createClient from "openapi-fetch";
import type { paths, components } from "./schema.gen";

export const api = createClient<paths>({
  baseUrl: "/",
});

export type Lane = components["schemas"]["Lane"];
export type LaneCreate = components["schemas"]["LaneCreate"];
export type LaneUpdate = components["schemas"]["LaneUpdate"];
export type Node = components["schemas"]["Node"];
export type NodeCreate = components["schemas"]["NodeCreate"];
export type NodeUpdate = components["schemas"]["NodeUpdate"];
export type NodeMove = components["schemas"]["NodeMove"];
export type NodeStatus = components["schemas"]["NodeStatus"];
export type Tag = components["schemas"]["Tag"];
export type TagUpdate = components["schemas"]["TagUpdate"];
export type Comment = components["schemas"]["Comment"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

export function unwrap<T>(res: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (res.error || !res.data) {
    throw new ApiError(
      res.response.status,
      (res.error as { error?: string; detail?: string })?.error ??
        res.response.statusText,
    );
  }
  return res.data;
}
