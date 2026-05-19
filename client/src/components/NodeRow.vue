<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import OutlinerEditor from "./OutlinerEditor.vue";
import { pendingFocusNodeId, clearFocus, requestFocus } from "./focus-bus";
import {
  useAttachTag,
  useCreateNode,
  useDeleteNode,
  useIndentNode,
  useNodes,
  useOutdentNode,
  useUpdateNode,
} from "@/api/queries";
import type { Node } from "@/api/client";

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
const del = useDeleteNode();
const attach = useAttachTag();

let saveTimer: number | null = null;
function scheduleSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (title.value !== props.node.title) {
      updateNode.mutate({ id: props.node.id, patch: { title: title.value } });
    }
  }, 400);
}

async function onEnter() {
  // create sibling after this node
  const created = await createNode.mutateAsync({
    parentId: props.node.parentId,
    laneId: isRoot.value ? props.laneId : null,
    beforeId: nextSiblingId.value,
    title: "",
  });
  requestFocus(created.id);
}

function onTab() {
  if (props.index === 0) return; // can't indent first
  indent.mutate(props.node.id);
}

function onShiftTab() {
  if (props.node.parentId === null) return;
  outdent.mutate(props.node.id);
}

function onShiftArrow(event: KeyboardEvent) {
  if (!isRoot.value) return;
  emit(
    "move-lane",
    event.key === "ArrowLeft" ? "left" : "right",
    props.node.id,
  );
}

function onBackspaceEmpty() {
  if (children.value.length > 0) return;
  if (props.siblings.length <= 1 && isRoot.value) return; // keep lane non-empty
  const prev = props.siblings[props.index - 1];
  del.mutate(props.node.id);
  if (prev) requestFocus(prev.id);
}

function onTagInserted(t: { id: string | null; label: string }) {
  if (t.id && t.id !== t.label) {
    attach.mutate({ nodeId: props.node.id, tag: { tagId: t.id } });
  } else {
    attach.mutate({ nodeId: props.node.id, tag: { name: t.label } });
  }
}

watch(
  pendingFocusNodeId,
  async (id) => {
    if (id === props.node.id) {
      await nextTick();
      editorRef.value?.focus();
      clearFocus();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col">
    <div
      class="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-neutral-900/60"
      :style="{ paddingLeft: `${depth * 16}px` }"
    >
      <span
        class="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-600 group-hover:bg-neutral-400"
        :title="node.status"
      />
      <div class="min-w-0 flex-1">
        <OutlinerEditor
          ref="editorRef"
          v-model="title"
          :placeholder="depth === 0 ? 'new item…' : ''"
          @update:model-value="scheduleSave"
          @key-enter="onEnter"
          @key-tab="onTab"
          @key-shift-tab="onShiftTab"
          @key-shift-arrow="onShiftArrow"
          @key-backspace-empty="onBackspaceEmpty"
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
