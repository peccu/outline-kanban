<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import OutlinerEditor from "./OutlinerEditor.vue";
import NodeDetailModal from "./NodeDetailModal.vue";
import TagPill from "./TagPill.vue";
import { focusCard, navigateCard } from "./card-nav";
import { clearPendingFocus, focusNode, registerFocusable } from "./focus-bus";
import { clearDropTarget, isDropBefore } from "./drop-state";
import { isNodeCollapsed, toggleNodeCollapsed } from "./collapsed-nodes";
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
  useDetachTag,
  useIndentNode,
  useMoveNode,
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
const cardEl = ref<HTMLDivElement | null>(null);

// Whether the inline title editor is active. In view mode the editor is
// non-editable and pointer-transparent, so clicks select the card instead
// of dropping a cursor into the title.
const editing = ref(!props.node.title.trim());

function enterEditMode() {
  editing.value = true;
  requestAnimationFrame(() => editorRef.value?.focus());
}

function focusEditor() {
  enterEditMode();
}

function focusSelfCard() {
  cardEl.value?.focus();
}

const nextSiblingId = computed(() => {
  const next = props.siblings[props.index + 1];
  return next?.id ?? null;
});

const childrenQuery = useNodes(
  computed(() => ({ parentId: props.node.id })),
);
const children = computed(() => childrenQuery.data.value ?? []);
const hasChildren = computed(() => children.value.length > 0);

// Org-mode style folding: when collapsed, the subtree is hidden behind a
// "…" indicator. Persisted per node in localStorage via collapsed-nodes.
const collapsed = computed(() => isNodeCollapsed(props.node.id));

function toggleCollapse() {
  if (!hasChildren.value) return;
  toggleNodeCollapsed(props.node.id);
}

const updateNode = useUpdateNode();
const createNode = useCreateNode();
const indent = useIndentNode();
const outdent = useOutdentNode();
const move = useMoveNode();
const del = useDeleteNode();
const attach = useAttachTag();
const detach = useDetachTag();

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

function leaveEditMode() {
  // Cancel any in-flight focus-bus retries so they don't pull focus back
  // into the editor after we land on the card.
  clearPendingFocus();
  editorRef.value?.blur();
  const pm = cardEl.value?.querySelector<HTMLElement>(".ProseMirror");
  pm?.blur();
  editing.value = false;
  // rAF lets ProseMirror finish its own focus side-effects first.
  requestAnimationFrame(() => focusSelfCard());
}

function onEnter() {
  flushSave();
  resetCycle(props.node.id);
  leaveEditMode();
}

function onEditorEscape() {
  flushSave();
  resetCycle(props.node.id);
  leaveEditMode();
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
  if (!confirm("Delete this card?")) return;
  const prev = props.siblings[props.index - 1];
  del.mutate(props.node.id);
  // Land on the previous card in *view* mode — if we dropped into edit
  // mode, a held-down Backspace would keep eating that card's title
  // characters. The user can press Enter / dblclick to start editing.
  if (prev) focusNode(prev.id, "view");
}

function onUserInput() {
  resetCycle(props.node.id);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onTagInserted(t: { id: string | null; label: string }) {
  if (t.id && UUID_RE.test(t.id)) {
    attach.mutate({ nodeId: props.node.id, tag: { tagId: t.id } });
  } else {
    attach.mutate({ nodeId: props.node.id, tag: { name: t.label } });
  }
}

function onTagRemoved(t: { id: string | null; label: string }) {
  // Prefer the uuid stored on the mention. If it's just a label (the
  // "create new" path), fall back to resolving by name against the node's
  // currently-attached tags.
  let tagId: string | null = null;
  if (t.id && UUID_RE.test(t.id)) tagId = t.id;
  else {
    const match = (props.node.tags ?? []).find((tag) => tag.name === t.label);
    if (match) tagId = match.id;
  }
  if (!tagId) return;
  detach.mutate({ nodeId: props.node.id, tagId });
}

const modalOpen = ref(false);
const hasDescription = computed(() => !!(props.node.bodyMd ?? "").trim());
const dragging = ref(false);

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return;
  // If the drag starts from inside the contenteditable, let the editor
  // own the text-drag UX instead of pulling the whole card.
  const t = e.target as HTMLElement | null;
  if (t && t.closest(".ProseMirror") && t !== cardEl.value) {
    return;
  }
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-node-id", props.node.id);
  e.dataTransfer.setData("text/plain", props.node.title);
  dragging.value = true;
}

function onDragEnd() {
  dragging.value = false;
  // Clear any drop indicator left over from a cancelled drag.
  clearDropTarget();
}

function onEditorBlur() {
  // Editor lost focus (user clicked outside, tabbed away, etc.) — drop
  // back to view mode so a stray click later doesn't drop a cursor into
  // the title.
  if (editing.value) editing.value = false;
}

function isEventOnOwnCard(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const ownCard = t.closest("[data-card-node-id]");
  return ownCard === cardEl.value;
}

// Single click = focus the card and open the detail modal. We delay the
// modal-open slightly so a follow-up dblclick can cancel it and enter
// title-edit mode instead.
let pendingClickTimer: number | null = null;
function cancelPendingClick() {
  if (pendingClickTimer !== null) {
    window.clearTimeout(pendingClickTimer);
    pendingClickTimer = null;
  }
}
function onCardClick(e: MouseEvent) {
  if (!isEventOnOwnCard(e)) return;
  if (editing.value) return; // already in edit mode — let the editor handle it
  // detail >= 2 means this click is part of a double-click sequence; ignore.
  if (e.detail >= 2) {
    cancelPendingClick();
    return;
  }
  cancelPendingClick();
  focusSelfCard();
  pendingClickTimer = window.setTimeout(() => {
    pendingClickTimer = null;
    modalOpen.value = true;
  }, 220);
}

function onCardDblClick(e: MouseEvent) {
  if (!isEventOnOwnCard(e)) return;
  if (editing.value) return; // editor owns dblclick (word selection)
  cancelPendingClick();
  e.preventDefault();
  enterEditMode();
}

// Keyboard handler for the card itself (when the inline editor is NOT
// focused). Lets the user navigate, enter edit mode, open the modal,
// or fire the same indent/move shortcuts as in the editor.
async function onCardKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  // If the inline editor (or any other input) is focused, ignore — the
  // editor has its own bindings.
  const t = e.target as HTMLElement | null;
  if (t && t.closest(".ProseMirror")) return;
  if (t && t !== cardEl.value) return; // focus must be on this card itself

  const mod = e.altKey || e.metaKey;
  const key = e.key;

  // Modal
  if (key === "o" && !mod && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    modalOpen.value = true;
    return;
  }

  // Tab → fold / unfold subtasks (org-mode style). Only meaningful when the
  // node actually has children; otherwise let the browser handle Tab so focus
  // can leave the board normally.
  if (key === "Tab" && !mod && !e.shiftKey && hasChildren.value) {
    e.preventDefault();
    toggleCollapse();
    return;
  }

  // Enter / F2 / e → edit mode
  if ((key === "Enter" && !mod && !e.shiftKey) || key === "F2" || key === "e") {
    e.preventDefault();
    focusEditor();
    return;
  }

  // M-Enter from card focus also creates a sibling.
  if (key === "Enter" && mod) {
    e.preventDefault();
    await onModEnter();
    return;
  }

  // Card-to-card navigation
  if (!mod && !e.shiftKey) {
    if (key === "ArrowDown") {
      e.preventDefault();
      navigateCard(props.node.id, props.laneId, "down");
      return;
    }
    if (key === "ArrowUp") {
      e.preventDefault();
      navigateCard(props.node.id, props.laneId, "up");
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      navigateCard(props.node.id, props.laneId, "left");
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      navigateCard(props.node.id, props.laneId, "right");
      return;
    }
  }

  // Shift+Arrow: move card across lanes (same as in editor)
  if (e.shiftKey && (key === "ArrowLeft" || key === "ArrowRight")) {
    e.preventDefault();
    onShiftArrow(e);
    // After the server moves the node, re-grab focus on the card div
    // (via a short follow-up tick — the row will remount).
    setTimeout(() => focusCard(props.node.id), 200);
    return;
  }

  // M-←/→: outdent / indent (same as editor)
  if (mod && key === "ArrowLeft") {
    e.preventDefault();
    await onModArrowLeft();
    setTimeout(() => focusCard(props.node.id), 200);
    return;
  }
  if (mod && key === "ArrowRight") {
    e.preventDefault();
    await onModArrowRight();
    setTimeout(() => focusCard(props.node.id), 200);
    return;
  }

  // Backspace from card focus deletes empty nodes too.
  if (key === "Backspace" || key === "Delete") {
    if (!title.value.trim()) {
      e.preventDefault();
      onBackspaceEmpty();
    }
  }
}

let unregister: (() => void) | null = null;
onMounted(() => {
  // focusNode() lands here via the focus-bus. Most callers (sibling
  // create, indent/move) want to stay in edit mode; the delete-empty
  // flow wants view mode so a held-down Backspace doesn't carry over
  // into the previous card's title.
  unregister = registerFocusable(props.node.id, (mode) => {
    if (mode === "view") {
      editing.value = false;
      requestAnimationFrame(() => cardEl.value?.focus());
    } else {
      editing.value = true;
      requestAnimationFrame(() => editorRef.value?.focus());
    }
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
  <div class="flex flex-col gap-1">
    <div
      v-if="depth === 0 && isDropBefore(node.id)"
      data-role="drop-indicator"
      class="h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
    />
    <div
      ref="cardEl"
      tabindex="-1"
      draggable="true"
      :data-card-node-id="node.id"
      :data-root-card="depth === 0 ? '' : null"
      class="group cursor-pointer rounded-md border border-neutral-800/60 bg-neutral-900/30 outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900/60 focus:border-emerald-500/70 focus:bg-neutral-900/70 focus:ring-1 focus:ring-emerald-500/60"
      :class="[
        dragging ? 'opacity-40' : '',
        editing ? 'cursor-text border-neutral-500 bg-neutral-900/70 ring-1 ring-neutral-500' : '',
      ]"
      :style="{ marginLeft: `${depth * 18}px` }"
      @keydown="onCardKeydown"
      @click="onCardClick"
      @dblclick="onCardDblClick"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
      <div class="flex items-start gap-2 px-2 py-1.5">
        <button
          v-if="hasChildren"
          type="button"
          tabindex="-1"
          draggable="false"
          class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          :title="collapsed ? 'Expand subtasks (Tab)' : 'Collapse subtasks (Tab)'"
          :aria-label="collapsed ? 'Expand subtasks' : 'Collapse subtasks'"
          :aria-expanded="!collapsed"
          @mousedown.stop
          @click.stop="toggleCollapse"
        >
          <svg
            viewBox="0 0 12 12"
            class="h-3 w-3 transition-transform"
            :class="collapsed ? '' : 'rotate-90'"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 2.5 8 6l-4 3.5z" />
          </svg>
        </button>
        <span
          v-else
          aria-hidden="true"
          class="mt-0.5 h-4 w-4 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <OutlinerEditor
            ref="editorRef"
            v-model="title"
            :editable="editing"
            :placeholder="depth === 0 ? 'new item…' : ''"
            @update:model-value="scheduleSave"
            @key-enter="onEnter"
            @key-escape="onEditorEscape"
            @key-mod-enter="onModEnter"
            @key-tab="onTab"
            @key-shift-tab="onShiftTab"
            @key-mod-arrow-left="onModArrowLeft"
            @key-mod-arrow-right="onModArrowRight"
            @key-shift-arrow="onShiftArrow"
            @key-backspace-empty="onBackspaceEmpty"
            @user-input="onUserInput"
            @tag-inserted="onTagInserted"
            @tag-removed="onTagRemoved"
            @blur="onEditorBlur"
          />
          <div
            v-if="(node.tags && node.tags.length > 0) || hasDescription"
            class="mt-1 flex flex-wrap items-center gap-1"
          >
            <span
              v-if="hasDescription"
              class="rounded bg-neutral-800 px-1.5 py-0 text-[10px] text-neutral-300"
              title="has description"
            >
              ¶
            </span>
            <TagPill
              v-for="t in node.tags ?? []"
              :key="t.id"
              :tag="t"
            />
          </div>
          <button
            v-if="collapsed && hasChildren"
            type="button"
            tabindex="-1"
            draggable="false"
            class="mt-1 rounded bg-neutral-800 px-1.5 py-0 text-[10px] text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
            :title="`Expand ${children.length} subtask(s) (Tab)`"
            @mousedown.stop
            @click.stop="toggleCollapse"
          >
            … {{ children.length }}
          </button>
        </div>
      </div>
    </div>
    <NodeRow
      v-for="(child, i) in (collapsed ? [] : children)"
      :key="child.id"
      :node="child"
      :siblings="children"
      :index="i"
      :lane-id="laneId"
      :depth="depth + 1"
      @move-lane="(d, id) => emit('move-lane', d, id)"
    />
    <NodeDetailModal
      v-if="modalOpen"
      :node-id="node.id"
      @close="modalOpen = false"
    />
  </div>
</template>
