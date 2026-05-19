<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import OutlinerEditor from "./OutlinerEditor.vue";
import { focusNode, registerFocusable } from "./focus-bus";
import {
  advanceCycle,
  getCycle,
  resetCycle,
  startCycle,
} from "./tab-cycle";
import { api } from "@/api/client";
import {
  useAttachTag,
  useCreateNode,
  useDeleteNode,
  useIndentNode,
  useMoveNode,
  useNodes,
  useOutdentNode,
  useUpdateNode,
} from "@/api/queries";
import type { Node, NodeStatus } from "@/api/client";

const STATUS_ORDER: NodeStatus[] = ["open", "doing", "done", "blocked"];
const STATUS_COLOR: Record<NodeStatus, string> = {
  open: "bg-neutral-600",
  doing: "bg-blue-500",
  done: "bg-emerald-500",
  blocked: "bg-rose-500",
};

const props = defineProps<{
  node: Node;
  siblings: Node[];
  index: number;
  laneId: string;
  depth: number;
}>();

const emit = defineEmits<{
  "move-lane": [direction: "left" | "right", nodeId: string];
}>();

const isRoot = computed(() => props.node.parentId === null);

const title = ref(props.node.title);
watch(
  () => props.node.title,
  (val) => {
    if (val !== title.value) title.value = val;
  },
);

const editorRef = ref<InstanceType<typeof OutlinerEditor> | null>(null);

const nextSiblingId = computed(() => {
  const next = props.siblings[props.index + 1];
  return next?.id ?? null;
});

const childrenQuery = useNodes(
  computed(() => ({ parentId: props.node.id })),
);
const children = computed(() => childrenQuery.data.value ?? []);

const updateNode = useUpdateNode();
const createNode = useCreateNode();
const indent = useIndentNode();
const outdent = useOutdentNode();
const move = useMoveNode();
const del = useDeleteNode();
const attach = useAttachTag();

let saveTimer: number | null = null;
function scheduleSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, 400);
}

function flushSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (title.value !== props.node.title) {
    updateNode.mutate({ id: props.node.id, patch: { title: title.value } });
  }
}

function onEnter() {
  // Confirm the title and stay on the card. The debounced save is flushed
  // immediately so the new value is durable.
  flushSave();
  resetCycle(props.node.id);
}

async function onModEnter() {
  // M-Enter creates a sibling at the same level.
  flushSave();
  resetCycle(props.node.id);
  const created = await createNode.mutateAsync({
    parentId: props.node.parentId,
    laneId: isRoot.value ? props.laneId : null,
    beforeId: nextSiblingId.value,
    title: "",
  });
  focusNode(created.id);
}

async function ensureCycleOrigin() {
  const id = props.node.id;
  if (getCycle(id)) return;
  // Fetch grandparent so we can implement the "parent's level" step.
  let grandparent: string | null = null;
  if (props.node.parentId) {
    const { data: parent } = await api.GET("/api/nodes/{id}", {
      params: { path: { id: props.node.parentId } },
    });
    grandparent = parent?.parentId ?? null;
  }
  startCycle(id, {
    parentId: props.node.parentId,
    laneId: props.node.laneId,
    rootLaneId: props.laneId,
    parentParentId: grandparent,
    nextSiblingId: nextSiblingId.value,
  });
}

async function applyCycleStep(step: number) {
  const id = props.node.id;
  const cycle = getCycle(id);
  if (!cycle) return;
  const o = cycle.origin;

  if (step === 0) {
    // Indent: become child of previous sibling
    const prev = props.siblings[props.index - 1];
    if (!prev) {
      // No previous sibling — skip to next cycle position instead
      advanceCycle(id);
      await applyCycleStep((step + 1) % 4);
      return;
    }
    focusNode(id);
    await indent.mutateAsync(id);
    focusNode(id);
    return;
  }

  if (step === 1) {
    // Back to origin
    focusNode(id);
    await move.mutateAsync({
      id,
      move: {
        parentId: o.parentId,
        laneId: o.laneId,
        beforeId: o.nextSiblingId,
      },
    });
    focusNode(id);
    return;
  }

  if (step === 2) {
    // Top level in the current lane
    focusNode(id);
    await move.mutateAsync({
      id,
      move: { parentId: null, laneId: o.rootLaneId, beforeId: null },
    });
    focusNode(id);
    return;
  }

  // step === 3: parent's level — sibling of origin's parent
  focusNode(id);
  if (o.parentParentId !== null) {
    await move.mutateAsync({
      id,
      move: { parentId: o.parentParentId, laneId: null, beforeId: null },
    });
  } else {
    // origin's parent was already root → "parent's level" is top
    await move.mutateAsync({
      id,
      move: { parentId: null, laneId: o.rootLaneId, beforeId: null },
    });
  }
  focusNode(id);
}

async function onTab() {
  const id = props.node.id;
  await ensureCycleOrigin();
  const cycle = getCycle(id);
  if (!cycle) return;
  const step = cycle.step;
  await applyCycleStep(step);
  advanceCycle(id);
}

async function onShiftTab() {
  resetCycle(props.node.id);
  if (props.node.parentId === null) return;
  const id = props.node.id;
  focusNode(id);
  await outdent.mutateAsync(id);
  focusNode(id);
}

async function onModArrowRight() {
  resetCycle(props.node.id);
  if (props.index === 0) return;
  const id = props.node.id;
  focusNode(id);
  await indent.mutateAsync(id);
  focusNode(id);
}

async function onModArrowLeft() {
  resetCycle(props.node.id);
  if (props.node.parentId === null) return;
  const id = props.node.id;
  focusNode(id);
  await outdent.mutateAsync(id);
  focusNode(id);
}

function onShiftArrow(event: KeyboardEvent) {
  resetCycle(props.node.id);
  if (!isRoot.value) return;
  emit(
    "move-lane",
    event.key === "ArrowLeft" ? "left" : "right",
    props.node.id,
  );
}

function onBackspaceEmpty() {
  resetCycle(props.node.id);
  if (children.value.length > 0) return;
  if (props.siblings.length <= 1 && isRoot.value) return; // keep lane non-empty
  const prev = props.siblings[props.index - 1];
  del.mutate(props.node.id);
  if (prev) focusNode(prev.id);
}

function onUserInput() {
  resetCycle(props.node.id);
}

function cycleStatus() {
  const current = props.node.status;
  const next =
    STATUS_ORDER[
      (STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length
    ]!;
  updateNode.mutate({ id: props.node.id, patch: { status: next } });
}

function onTagInserted(t: { id: string | null; label: string }) {
  if (t.id && t.id !== t.label) {
    attach.mutate({ nodeId: props.node.id, tag: { tagId: t.id } });
  } else {
    attach.mutate({ nodeId: props.node.id, tag: { name: t.label } });
  }
}

let unregister: (() => void) | null = null;
onMounted(() => {
  unregister = registerFocusable(props.node.id, () => {
    editorRef.value?.focus();
  });
});
onBeforeUnmount(() => {
  unregister?.();
  unregister = null;
  // Don't reset the Tab cycle here: when an indent/move shuffles the row to
  // a new parent, the NodeRow remounts, and the cycle must survive that.
});
</script>

<template>
  <div class="flex flex-col">
    <div
      class="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-neutral-900/60"
      :style="{ paddingLeft: `${depth * 16}px` }"
    >
      <button
        type="button"
        class="mt-2 size-2 shrink-0 rounded-full transition-transform hover:scale-125"
        :class="STATUS_COLOR[node.status]"
        :title="`status: ${node.status} (click to cycle)`"
        @click="cycleStatus"
      />
      <div class="min-w-0 flex-1">
        <OutlinerEditor
          ref="editorRef"
          v-model="title"
          :placeholder="depth === 0 ? 'new item…' : ''"
          @update:model-value="scheduleSave"
          @key-enter="onEnter"
          @key-mod-enter="onModEnter"
          @key-tab="onTab"
          @key-shift-tab="onShiftTab"
          @key-mod-arrow-left="onModArrowLeft"
          @key-mod-arrow-right="onModArrowRight"
          @key-shift-arrow="onShiftArrow"
          @key-backspace-empty="onBackspaceEmpty"
          @user-input="onUserInput"
          @tag-inserted="onTagInserted"
        />
        <ul
          v-if="node.tags && node.tags.length > 0"
          class="mt-0.5 flex flex-wrap gap-1"
        >
          <li
            v-for="t in node.tags"
            :key="t.id"
            class="rounded bg-emerald-500/10 px-1.5 py-0 text-[10px] font-mono text-emerald-300"
          >
            #{{ t.name }}
          </li>
        </ul>
      </div>
    </div>
    <NodeRow
      v-for="(child, i) in children"
      :key="child.id"
      :node="child"
      :siblings="children"
      :index="i"
      :lane-id="laneId"
      :depth="depth + 1"
      @move-lane="(d, id) => emit('move-lane', d, id)"
    />
  </div>
</template>
