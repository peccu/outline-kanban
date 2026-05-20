<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Lane } from "@/api/client";
import { useDeleteLane, useUpdateLane } from "@/api/queries";
import { hideLane } from "./hidden-lanes";

const props = defineProps<{ lane: Lane }>();

const renameMode = ref(false);
const draft = ref(props.lane.name);
const menuOpen = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const update = useUpdateLane();
const del = useDeleteLane();

watch(
  () => props.lane.name,
  (v) => {
    if (!renameMode.value) draft.value = v;
  },
);

function startRename() {
  draft.value = props.lane.name;
  renameMode.value = true;
  menuOpen.value = false;
  nextTick(() => inputRef.value?.select());
}

function commitRename() {
  const next = draft.value.trim();
  renameMode.value = false;
  if (!next || next === props.lane.name) {
    draft.value = props.lane.name;
    return;
  }
  update.mutate({ id: props.lane.id, patch: { name: next } });
}

function cancelRename() {
  draft.value = props.lane.name;
  renameMode.value = false;
}

function onRenameKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    commitRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelRename();
  }
}

function doHide() {
  menuOpen.value = false;
  hideLane(props.lane.id);
}

function doDelete() {
  menuOpen.value = false;
  if (!confirm(`Delete lane "${props.lane.name}"? Cards in it become unassigned.`))
    return;
  del.mutate(props.lane.id);
}

function onDocClick(e: MouseEvent) {
  if (!menuOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (!t?.closest("[data-lane-menu]")) menuOpen.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <header
    class="flex items-center gap-2 border-b border-neutral-800 px-3 py-2"
  >
    <span
      class="inline-block size-2.5 shrink-0 rounded-full"
      :style="{ background: lane.color ?? '#525252' }"
    />

    <input
      v-if="renameMode"
      ref="inputRef"
      v-model="draft"
      class="flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-100 focus:border-neutral-500 focus:outline-none"
      @blur="commitRename"
      @keydown="onRenameKey"
    />
    <h2
      v-else
      class="flex-1 cursor-text truncate text-xs font-semibold uppercase tracking-wide text-neutral-300 hover:text-neutral-100"
      :title="lane.name"
      @dblclick="startRename"
    >
      {{ lane.name }}
    </h2>

    <div class="relative" data-lane-menu>
      <button
        type="button"
        class="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        aria-label="lane menu"
        @click.stop="menuOpen = !menuOpen"
      >
        ⋯
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-7 z-20 w-32 overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 text-xs shadow-xl"
      >
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left hover:bg-neutral-800"
          @click="startRename"
        >
          rename
        </button>
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left hover:bg-neutral-800"
          @click="doHide"
        >
          hide
        </button>
        <button
          type="button"
          class="block w-full border-t border-neutral-800 px-3 py-1.5 text-left text-rose-400 hover:bg-neutral-800"
          @click="doDelete"
        >
          delete
        </button>
      </div>
    </div>
  </header>
</template>
