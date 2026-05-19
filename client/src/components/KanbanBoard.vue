<script setup lang="ts">
import { computed } from "vue";
import OutlinePanel from "./OutlinePanel.vue";
import { useLanes, useMoveNode } from "@/api/queries";

const { data, isPending, isError, error } = useLanes();
const lanes = computed(() => data.value ?? []);

const move = useMoveNode();

function onMoveLane(
  direction: "left" | "right",
  nodeId: string,
  currentLaneId: string,
) {
  const list = lanes.value;
  const idx = list.findIndex((l) => l.id === currentLaneId);
  if (idx < 0) return;
  const targetIdx = direction === "left" ? idx - 1 : idx + 1;
  const target = list[targetIdx];
  if (!target) return;
  move.mutate({
    id: nodeId,
    move: { parentId: null, laneId: target.id, beforeId: null },
  });
}
</script>

<template>
  <div v-if="isPending" class="px-4 py-6 text-neutral-400">loading lanes…</div>
  <div v-else-if="isError" class="px-4 py-6 text-red-400">
    {{ (error as Error).message }}
  </div>
  <div
    v-else
    class="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-6"
  >
    <section
      v-for="lane in lanes"
      :key="lane.id"
      class="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border border-neutral-800 bg-neutral-900/40"
    >
      <header
        class="flex items-center gap-2 border-b border-neutral-800 px-3 py-2"
      >
        <span
          class="inline-block size-2.5 rounded-full"
          :style="{ background: lane.color ?? '#525252' }"
        />
        <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-300">
          {{ lane.name }}
        </h2>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <OutlinePanel
          :lane-id="lane.id"
          @move-lane="(d, id) => onMoveLane(d, id, lane.id)"
        />
      </div>
    </section>
  </div>
</template>
