<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Lane } from "@/api/client";
import { useDeleteLane, useUpdateLane } from "@/api/queries";
import { hideLane } from "./hidden-lanes";
import { TAG_COLOR_PRESETS } from "@/lib/tag-color";

const props = defineProps<{ lane: Lane }>();
const emit = defineEmits<{
  "shift-lane": [direction: "left" | "right", laneId: string];
  "drag-start": [laneId: string];
  "drag-end": [];
}>();

function onHeaderKeydown(e: KeyboardEvent) {
  if (renameMode.value) return;
  if (!e.shiftKey) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    emit("shift-lane", "left", props.lane.id);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    emit("shift-lane", "right", props.lane.id);
  }
}

function onHeaderDragStart(e: DragEvent) {
  // If the user started the drag from inside the rename input or the
  // menu button, don't hijack it.
  const t = e.target as HTMLElement | null;
  if (t && (t.closest("input") || t.closest("[data-lane-menu]"))) return;
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-lane-id", props.lane.id);
  emit("drag-start", props.lane.id);
}

function onHeaderDragEnd() {
  emit("drag-end");
}

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

function toggleClosed() {
  menuOpen.value = false;
  update.mutate({ id: props.lane.id, patch: { isClosed: !props.lane.isClosed } });
}

function setColor(color: string | null) {
  if (color === (props.lane.color ?? null)) return;
  update.mutate({ id: props.lane.id, patch: { color } });
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
    tabindex="0"
    draggable="true"
    :data-lane-header-id="lane.id"
    class="flex cursor-grab items-center gap-2 rounded-t-lg border-b border-neutral-800 px-3 py-2 outline-none transition-colors focus:bg-neutral-900/50 focus:ring-1 focus:ring-emerald-500/60 active:cursor-grabbing"
    @keydown="onHeaderKeydown"
    @dragstart="onHeaderDragStart"
    @dragend="onHeaderDragEnd"
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
      class="flex-1 cursor-text truncate text-xs font-semibold uppercase tracking-wide hover:text-neutral-100"
      :class="lane.isClosed ? 'text-neutral-500 line-through' : 'text-neutral-300'"
      :title="lane.isClosed ? `${lane.name} (closed)` : lane.name"
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
          @click="toggleClosed"
        >
          {{ lane.isClosed ? 'unmark closed' : 'mark as closed' }}
        </button>
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left hover:bg-neutral-800"
          @click="doHide"
        >
          hide
        </button>
        <div class="border-t border-neutral-800 px-3 py-1.5">
          <div class="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
            color
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="preset in TAG_COLOR_PRESETS"
              :key="preset.value"
              type="button"
              class="size-4 rounded-full border transition-transform hover:scale-110"
              :style="{
                backgroundColor: preset.value,
                borderColor:
                  (lane.color ?? '').toLowerCase() === preset.value.toLowerCase()
                    ? '#fafafa'
                    : 'transparent',
              }"
              :title="preset.name"
              :aria-label="`set lane color ${preset.name}`"
              @click.stop="setColor(preset.value)"
            />
            <button
              v-if="lane.color"
              type="button"
              class="ml-1 rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              title="reset to default"
              aria-label="reset lane color"
              @click.stop="setColor(null)"
            >
              reset
            </button>
          </div>
        </div>
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
