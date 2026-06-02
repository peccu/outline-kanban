import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import {
  api,
  unwrap,
  type Lane,
  type LaneCreate,
  type LaneUpdate,
  type Node,
  type NodeCreate,
  type NodeMove,
  type NodeUpdate,
  type Tag,
} from "./client";

export const qk = {
  lanes: () => ["lanes"] as const,
  nodes: (filter?: { laneId?: string; parentId?: string; status?: string }) =>
    ["nodes", filter ?? {}] as const,
  node: (id: string) => ["node", id] as const,
  tags: () => ["tags"] as const,
  comments: (nodeId: string) => ["comments", nodeId] as const,
};

// ---------- lanes ----------

export function useLanes() {
  return useQuery({
    queryKey: qk.lanes(),
    queryFn: async () => unwrap(await api.GET("/api/lanes")),
  });
}

export function useReorderLane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; beforeLaneId: string | null }) =>
      unwrap(
        await api.POST("/api/lanes/{id}/reorder", {
          params: { path: { id: vars.id } },
          body: { beforeLaneId: vars.beforeLaneId },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lanes() }),
  });
}

export function useCreateLane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LaneCreate) =>
      unwrap(await api.POST("/api/lanes", { body })),
    onSuccess: (lane: Lane) => {
      qc.setQueryData<Lane[]>(qk.lanes(), (old) => [...(old ?? []), lane]);
    },
  });
}

export function useUpdateLane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: LaneUpdate }) =>
      unwrap(
        await api.PATCH("/api/lanes/{id}", {
          params: { path: { id: vars.id } },
          body: vars.patch,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lanes() }),
  });
}

export function useDeleteLane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await api.DELETE("/api/lanes/{id}", {
        params: { path: { id } },
      });
      if (r.response.status !== 204 && r.error)
        throw new Error("delete failed");
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lanes() }),
  });
}

// ---------- nodes ----------

export function useNodes(
  filter: MaybeRefOrGetter<{
    laneId?: string;
    parentId?: string;
    status?: string;
  }>,
) {
  return useQuery({
    queryKey: computed(() => qk.nodes(toValue(filter))),
    queryFn: async () => {
      const f = toValue(filter);
      return unwrap(
        await api.GET("/api/nodes", {
          params: {
            query: {
              ...(f.laneId ? { laneId: f.laneId } : {}),
              ...(f.parentId ? { parentId: f.parentId } : {}),
              ...(f.status
                ? { status: f.status as NonNullable<Node["status"]> }
                : {}),
            },
          },
        }),
      );
    },
  });
}

export function useNode(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => qk.node(toValue(id) ?? "")),
    enabled: computed(() => !!toValue(id)),
    queryFn: async () => {
      const v = toValue(id);
      if (!v) throw new Error("no id");
      return unwrap(
        await api.GET("/api/nodes/{id}", { params: { path: { id: v } } }),
      );
    },
  });
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NodeCreate) =>
      unwrap(await api.POST("/api/nodes", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: NodeUpdate }) =>
      unwrap(
        await api.PATCH("/api/nodes/{id}", {
          params: { path: { id: vars.id } },
          body: vars.patch,
        }),
      ),
    onSuccess: (node) => {
      qc.setQueryData<Node>(qk.node(node.id), node);
      qc.invalidateQueries({ queryKey: ["nodes"] });
    },
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.DELETE("/api/nodes/{id}", { params: { path: { id } } });
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function useMoveNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; move: NodeMove }) =>
      unwrap(
        await api.POST("/api/nodes/{id}/move", {
          params: { path: { id: vars.id } },
          body: vars.move,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function useIndentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.POST("/api/nodes/{id}/indent", {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function useOutdentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.POST("/api/nodes/{id}/outdent", {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

// ---------- tags ----------

export function useTags() {
  return useQuery({
    queryKey: qk.tags(),
    queryFn: async () => unwrap(await api.GET("/api/tags")),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: { color?: string | null } }) =>
      unwrap(
        await api.PATCH("/api/tags/{id}", {
          params: { path: { id: vars.id } },
          body: vars.patch,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tags() });
      // Node listings include their tags, so refresh them too.
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["node"] });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await api.DELETE("/api/tags/{id}", {
        params: { path: { id } },
      });
      if (r.response.status !== 204 && r.error) throw new Error("delete failed");
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tags() });
      // Deleting a tag detaches it everywhere, so refresh node listings too.
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["node"] });
    },
  });
}

export function useAttachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      nodeId: string;
      tag: { tagId?: string; name?: string };
    }) =>
      unwrap(
        await api.POST("/api/nodes/{id}/tags", {
          params: { path: { id: vars.nodeId } },
          body: vars.tag,
        }),
      ),
    onSuccess: (_t, vars) => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: qk.node(vars.nodeId) });
      qc.invalidateQueries({ queryKey: qk.tags() });
    },
  });
}

export function useDetachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { nodeId: string; tagId: string }) => {
      await api.DELETE("/api/nodes/{id}/tags/{tagId}", {
        params: { path: { id: vars.nodeId, tagId: vars.tagId } },
      });
      return vars;
    },
    onSuccess: (vars) => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: qk.node(vars.nodeId) });
    },
  });
}

// ---------- comments ----------

export function useComments(nodeId: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => qk.comments(toValue(nodeId) ?? "")),
    enabled: computed(() => !!toValue(nodeId)),
    queryFn: async () => {
      const id = toValue(nodeId);
      if (!id) throw new Error("no nodeId");
      return unwrap(
        await api.GET("/api/nodes/{id}/comments", {
          params: { path: { id } },
        }),
      );
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { nodeId: string; bodyMd: string }) =>
      unwrap(
        await api.POST("/api/nodes/{id}/comments", {
          params: { path: { id: vars.nodeId } },
          body: { bodyMd: vars.bodyMd },
        }),
      ),
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: qk.comments(vars.nodeId) });
      // Refresh node listings so the card's comment-count badge updates.
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: qk.node(vars.nodeId) });
    },
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      nodeId: string;
      bodyMd: string;
    }) =>
      unwrap(
        await api.PATCH("/api/comments/{id}", {
          params: { path: { id: vars.id } },
          body: { bodyMd: vars.bodyMd },
        }),
      ),
    onSuccess: (_c, vars) =>
      qc.invalidateQueries({ queryKey: qk.comments(vars.nodeId) }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; nodeId: string }) => {
      const r = await api.DELETE("/api/comments/{id}", {
        params: { path: { id: vars.id } },
      });
      if (r.response.status !== 204 && r.error)
        throw new Error("delete failed");
      return vars;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: qk.comments(vars.nodeId) });
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: qk.node(vars.nodeId) });
    },
  });
}
