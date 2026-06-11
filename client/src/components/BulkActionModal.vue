<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  useAttachTag,
  useLanes,
  useMoveNode,
  useNodes,
  useTags,
  useUpdateNode,
} from "@/api/queries";
import {
  clearSelection,
  closeBulkPanel,
  selectedNodeIds,
  selectionCount,
} from "./multi-select";

const { data: lanes } = useLanes();
const { data: allTags } = useTags();
const allNodesQuery = useNodes(() => ({}));

const attach = useAttachTag();
const move = useMoveNode();
const update = useUpdateNode();

const tagInput = ref("");
const busy = ref(false);
const status = ref<string | null>(null);

const ids = computed(() => [...selectedNodeIds.value]);
const nodeById = computed(
  () => new Map((allNodesQuery.data.value ?? []).map((n) => [n.id, n])),
);

const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().replace(/^#/, "").toLowerCase();
  return (allTags.value ?? [])
    .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
    .slice(0, 8);
});
const canCreateTag = computed(() => {
  const name = tagInput.value.trim().replace(/^#/, "");
  if (!name) return false;
  return !(allTags.value ?? []).some(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
});

async function applyTag(tag: { tagId?: string; name?: string }) {
  busy.value = true;
  status.value = "tagging…";
  try {
    await Promise.all(
      ids.value.map((nodeId) => attach.mutateAsync({ nodeId, tag })),
    );
    status.value = `tagged ${ids.value.length} card(s)`;
  } finally {
    busy.value = false;
  }
}

function addTagFromInput() {
  const clean = tagInput.value.trim().replace(/^#/, "");
  if (!clean) return;
  const exact = (allTags.value ?? []).find(
    (t) => t.name.toLowerCase() === clean.toLowerCase(),
  );
  void applyTag(exact ? { tagId: exact.id } : { name: clean });
  tagInput.value = "";
}

async function moveAllToLane(laneId: string) {
  busy.value = true;
  status.value = "moving…";
  try {
    await Promise.all(
      ids.value.map((id) => {
        const n = nodeById.value.get(id);
        // Roots move into the lane; subtasks just get their lane relabeled.
        if (n && n.parentId) {
          return update.mutateAsync({ id, patch: { laneId } });
        }
        return move.mutateAsync({
          id,
          move: { parentId: null, laneId, beforeId: null },
        });
      }),
    );
    status.value = `moved ${ids.value.length} card(s)`;
  } finally {
    busy.value = false;
  }
}

function done() {
  clearSelection();
  closeBulkPanel();
}

const modalRoot = ref<HTMLElement | null>(null);
const tagInputEl = ref<HTMLInputElement | null>(null);
let previousFocus: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

function focusableInModal(): HTMLElement[] {
  const root = modalRoot.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null && el.tabIndex >= 0,
  );
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeBulkPanel();
    return;
  }
  if (e.key === "Tab") {
    // Trap Tab inside the modal so focus can't escape back to the cards
    // behind it (mirrors NodeDetailModal).
    const root = modalRoot.value;
    if (!root) return;
    const els = focusableInModal();
    if (els.length === 0) {
      e.preventDefault();
      root.focus();
      return;
    }
    const first = els[0]!;
    const last = els[els.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !root.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  document.addEventListener("keydown", onKeyDown, true);
  // Land focus on the tag input so the modal is keyboard-ready the moment it
  // opens (M-Enter from a multi-selection); otherwise focus stays on the card.
  requestAnimationFrame(() => {
    const target = tagInputEl.value ?? modalRoot.value;
    target?.focus();
  });
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown, true);
  // Return focus to whatever opened the modal — typically the card div, so
  // card-focus shortcuts keep working after the modal closes.
  previousFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeBulkPanel"
    >
      <div
        ref="modalRoot"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        class="flex w-full max-w-md flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-2xl outline-none"
      >
        <header class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-neutral-100">
            edit {{ selectionCount }} selected card(s)
          </h2>
          <button
            type="button"
            class="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
            aria-label="close"
            @click="closeBulkPanel"
          >
            ✕
          </button>
        </header>

        <section>
          <h3 class="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            add tag to all
          </h3>
          <input
            ref="tagInputEl"
            v-model="tagInput"
            type="text"
            placeholder="tag name… (Enter to apply)"
            class="w-full rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
            :disabled="busy"
            @keydown.enter.prevent="addTagFromInput"
          />
          <ul v-if="tagSuggestions.length || canCreateTag" class="mt-1 flex flex-wrap gap-1">
            <li v-for="s in tagSuggestions" :key="s.id">
              <button
                type="button"
                class="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900"
                @click="applyTag({ tagId: s.id })"
              >
                #{{ s.name }}
              </button>
            </li>
            <li v-if="canCreateTag">
              <button
                type="button"
                class="rounded border border-emerald-700/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/10"
                @click="addTagFromInput"
              >
                + create #{{ tagInput.trim().replace(/^#/, "") }}
              </button>
            </li>
          </ul>
        </section>

        <section>
          <h3 class="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            move all to lane
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="l in lanes ?? []"
              :key="l.id"
              type="button"
              class="flex items-center gap-1.5 rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-600"
              :disabled="busy"
              @click="moveAllToLane(l.id)"
            >
              <span class="inline-block size-2 rounded-full" :style="{ background: l.color ?? '#525252' }" />
              {{ l.name }}
            </button>
          </div>
        </section>

        <footer class="flex items-center justify-between">
          <span class="text-[11px] text-neutral-500">{{ status }}</span>
          <button
            type="button"
            class="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            @click="done"
          >
            done & clear
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
