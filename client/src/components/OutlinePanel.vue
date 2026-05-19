<script setup lang="ts">
import { computed } from "vue";
import NodeRow from "./NodeRow.vue";
import { useCreateNode, useNodes } from "@/api/queries";
import { focusNode } from "./focus-bus";

const props = defineProps<{ laneId: string }>();

const emit = defineEmits<{
  "move-lane": [direction: "left" | "right", nodeId: string];
}>();

const filter = computed(() => ({
  laneId: props.laneId,
  parentId: "null",
}));
const { data, isPending } = useNodes(filter);
const nodes = computed(() => data.value ?? []);

const createNode = useCreateNode();

async function addNode() {
  const created = await createNode.mutateAsync({
    laneId: props.laneId,
    parentId: null,
    title: "",
  });
  focusNode(created.id);
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      v-if="isPending"
      class="px-2 py-1 text-xs text-neutral-500"
    >
      loading…
    </div>
    <NodeRow
      v-for="(node, i) in nodes"
      :key="node.id"
      :node="node"
      :siblings="nodes"
      :index="i"
      :lane-id="laneId"
      :depth="0"
      @move-lane="(d, id) => emit('move-lane', d, id)"
    />
    <button
      type="button"
      data-role="add-node"
      class="mt-1 rounded px-2 py-1 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-300 focus:bg-neutral-900 focus:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-600"
      @click="addNode"
    >
      + add <span class="text-neutral-700">(Enter)</span>
    </button>
  </div>
</template>
