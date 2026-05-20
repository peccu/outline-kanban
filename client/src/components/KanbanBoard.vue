<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import LaneHeader from "./LaneHeader.vue";
import OutlinePanel from "./OutlinePanel.vue";
import {
  useCreateLane,
  useLanes,
  useMoveNode,
  useReorderLane,
} from "@/api/queries";
import {
  clearHidden,
  isLaneHidden,
  showLane,
} from "./hidden-lanes";
import {
  clearDropTarget,
  clearLaneDropTarget,
  getDropTarget,
  getLaneDropTarget,
  isLaneDropAtEnd,
  isLaneDropBefore,
  setDropTarget,
  setLaneDropTarget,
} from "./drop-state";

const { data, isPending, isError, error } = useLanes();
const allLanes = computed(() => data.value ?? []);

const _cleanup = computed(() => {
  if (data.value) clearHidden(data.value.map((l) => l.id));
  return null;
});
void _cleanup;

const moveMutation = useMoveNode();
const createLane = useCreateLane();
const reorderLane = useReorderLane();
const draggingLaneId = ref<string | null>(null);

function shiftLane(direction: "left" | "right", laneId: string) {
  const list = allLanes.value;
  const idx = list.findIndex((l) => l.id === laneId);
  if (idx < 0) return;
  if (direction === "left") {
    if (idx === 0) return;
    // To move left of the current left neighbour: drop *before* that neighbour.
    const beforeLaneId = list[idx - 1]!.id;
    reorderLane.mutate({ id: laneId, beforeLaneId });
  } else {
    if (idx >= list.length - 1) return;
    // To move right past the current right neighbour: drop before the lane
    // after that neighbour (or to the end if none).
    const after = list[idx + 2];
    reorderLane.mutate({ id: laneId, beforeLaneId: after ? after.id : null });
  }
  // Re-focus the moved lane's header on the next tick so keyboard
  // chaining keeps working.
  setTimeout(() => {
    document
      .querySelector<HTMLElement>(`[data-lane-header-id="${laneId}"]`)
      ?.focus();
  }, 80);
}

function onLaneDragStart(laneId: string) {
  draggingLaneId.value = laneId;
}
function onLaneDragEnd() {
  draggingLaneId.value = null;
  clearLaneDropTarget();
}

function resolveLaneDropTarget(e: DragEvent): string | null {
  // Find the first lane section whose horizontal midpoint is right of
  // the pointer. That lane becomes `beforeLaneId`; if none does, drop
  // at the end of the board.
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("section[data-lane-id]"),
  );
  const x = e.clientX;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (x < r.left + r.width / 2) return s.dataset.laneId ?? null;
  }
  return null;
}

function onBoardDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes("application/x-lane-id")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const beforeLaneId = resolveLaneDropTarget(e);
  const cur = getLaneDropTarget();
  if (!cur || cur.beforeLaneId !== beforeLaneId) {
    setLaneDropTarget({ beforeLaneId });
  }
}

function onBoardDrop(e: DragEvent) {
  const laneId = e.dataTransfer?.getData("application/x-lane-id");
  const target = getLaneDropTarget();
  clearLaneDropTarget();
  draggingLaneId.value = null;
  if (!laneId) return;
  e.preventDefault();
  // Dropping before yourself is a no-op.
  if (target?.beforeLaneId === laneId) return;
  reorderLane.mutate({
    id: laneId,
    beforeLaneId: target?.beforeLaneId ?? null,
  });
}

function onBoardDragLeave(e: DragEvent) {
  const next = e.relatedTarget as HTMLElement | null;
  // Only clear when the cursor truly leaves the whole board container.
  if (next && (e.currentTarget as HTMLElement)?.contains(next)) return;
  clearLaneDropTarget();
}

const dragOverLaneId = ref<string | null>(null);

function onMoveLaneShortcut(
  direction: "left" | "right",
  nodeId: string,
  currentLaneId: string,
) {
  // Visible-only navigation across lanes; collapsed lanes still count as
  // positions so keyboard parity matches DnD parity.
  const list = allLanes.value;
  const idx = list.findIndex((l) => l.id === currentLaneId);
  if (idx < 0) return;
  const targetIdx = direction === "left" ? idx - 1 : idx + 1;
  const target = list[targetIdx];
  if (!target) return;
  moveMutation.mutate({
    id: nodeId,
    move: { parentId: null, laneId: target.id, beforeId: null },
  });
}

function resolveDropTarget(e: DragEvent, laneId: string): string | null {
  // Find the first root-level card whose vertical midpoint is below the
  // pointer. That card becomes `beforeId`; if none does, drop at end.
  const section = (e.currentTarget as HTMLElement).closest<HTMLElement>(
    "section[data-lane-id]",
  );
  if (!section) return null;
  const cards = Array.from(
    section.querySelectorAll<HTMLElement>("[data-root-card]"),
  );
  const y = e.clientY;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      return card.dataset.cardNodeId ?? null;
    }
  }
  return null;
}

function onDragOver(e: DragEvent, laneId: string) {
  if (!e.dataTransfer?.types.includes("application/x-node-id")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dragOverLaneId.value = laneId;
  const beforeId = resolveDropTarget(e, laneId);
  const cur = getDropTarget();
  if (!cur || cur.laneId !== laneId || cur.beforeId !== beforeId) {
    setDropTarget({ laneId, beforeId });
  }
}

function onDragLeave(e: DragEvent, laneId: string) {
  const next = e.relatedTarget as HTMLElement | null;
  if (next && (e.currentTarget as HTMLElement)?.contains(next)) return;
  if (dragOverLaneId.value === laneId) dragOverLaneId.value = null;
  // Only clear the precise target if we're truly leaving — entering a
  // sibling lane will re-set it on its own dragover.
  const cur = getDropTarget();
  if (cur && cur.laneId === laneId && (!next || !next.closest("section[data-lane-id]"))) {
    clearDropTarget();
  }
}

function onDrop(e: DragEvent, laneId: string) {
  const nodeId = e.dataTransfer?.getData("application/x-node-id");
  dragOverLaneId.value = null;
  const target = getDropTarget();
  clearDropTarget();
  if (!nodeId) return;
  e.preventDefault();
  const beforeId =
    target && target.laneId === laneId ? target.beforeId : null;
  // Dropping right before yourself (or right after the previous sibling
  // == before yourself) is a no-op; skip the mutation.
  if (beforeId === nodeId) return;
  moveMutation.mutate({
    id: nodeId,
    move: { parentId: null, laneId, beforeId },
  });
}

async function addLane() {
  const name = prompt("Lane name:");
  if (!name?.trim()) return;
  await createLane.mutateAsync({ name: name.trim() });
}

// On first load, drop focus on the first card so the user can see where
// keyboard input will go. If there are no cards yet, fall back to the
// first lane's +add button. Only do this once per app session and only
// if the user hasn't already focused something themselves.
let initialFocusDone = false;
function tryInitialFocus() {
  if (initialFocusDone) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.tagName !== "HTML") return;
  const target =
    document.querySelector<HTMLElement>("[data-card-node-id]") ??
    document.querySelector<HTMLElement>("button[data-role='add-node']");
  if (!target) return;
  target.focus({ preventScroll: false });
  initialFocusDone = true;
}

onMounted(() => {
  // Lanes/nodes load asynchronously — retry a few times until something
  // is in the DOM.
  let attempts = 0;
  const tick = () => {
    tryInitialFocus();
    if (initialFocusDone) return;
    if (++attempts > 20) return;
    setTimeout(tick, 75);
  };
  tick();
});

// If the very first lane finishes loading later than expected, re-try.
watch(allLanes, () => tryInitialFocus());
</script>

<template>
  <div v-if="isPending" class="px-4 py-6 text-neutral-400">loading lanes…</div>
  <div v-else-if="isError" class="px-4 py-6 text-red-400">
    {{ (error as Error).message }}
  </div>
  <div
    v-else
    class="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-6 pt-3"
    @dragover="onBoardDragOver"
    @dragleave="onBoardDragLeave"
    @drop="onBoardDrop"
  >
    <template v-for="lane in allLanes" :key="lane.id">
      <!-- lane-level drop indicator: vertical emerald bar before this lane -->
      <div
        v-if="isLaneDropBefore(lane.id)"
        data-role="lane-drop-indicator"
        class="-mx-1 w-0.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
      />
      <!-- collapsed lane: thin column, still positioned, still droppable -->
      <section
        v-if="isLaneHidden(lane.id)"
        :data-lane-id="lane.id"
        class="flex h-full min-h-0 w-10 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/30 py-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60"
        :class="[
          dragOverLaneId === lane.id ? 'border-emerald-500/70 bg-emerald-950/30' : '',
          draggingLaneId === lane.id ? 'opacity-40' : '',
        ]"
        :title="`${lane.name} (collapsed, click to expand)`"
        @click="showLane(lane.id)"
        @dragover="onDragOver($event, lane.id)"
        @dragleave="onDragLeave($event, lane.id)"
        @drop="onDrop($event, lane.id)"
      >
        <span
          class="mt-1 inline-block size-2 rounded-full"
          :style="{ background: lane.color ?? '#525252' }"
        />
        <span
          class="text-[10px] uppercase tracking-wide [writing-mode:vertical-rl] [text-orientation:mixed]"
        >
          {{ lane.name }}
        </span>
      </section>

      <!-- expanded lane -->
      <section
        v-else
        :data-lane-id="lane.id"
        class="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border border-neutral-800 bg-neutral-900/40 transition-colors"
        :class="[
          dragOverLaneId === lane.id ? 'border-emerald-500/70 bg-emerald-950/20' : '',
          draggingLaneId === lane.id ? 'opacity-40' : '',
        ]"
      >
        <LaneHeader
          :lane="lane"
          @shift-lane="shiftLane"
          @drag-start="onLaneDragStart"
          @drag-end="onLaneDragEnd"
        />
        <div
          class="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          @dragover="onDragOver($event, lane.id)"
          @dragleave="onDragLeave($event, lane.id)"
          @drop="onDrop($event, lane.id)"
        >
          <OutlinePanel
            :lane-id="lane.id"
            @move-lane="(d, id) => onMoveLaneShortcut(d, id, lane.id)"
          />
        </div>
      </section>
    </template>

    <!-- end-of-board lane drop indicator -->
    <div
      v-if="isLaneDropAtEnd()"
      data-role="lane-drop-indicator"
      class="-mx-1 w-0.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
    />

    <button
      type="button"
      class="flex h-12 w-72 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 text-sm text-neutral-500 transition-colors hover:border-neutral-500 hover:bg-neutral-900/40 hover:text-neutral-300"
      @click="addLane"
    >
      + lane
    </button>
  </div>
</template>
