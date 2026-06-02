import { computed, ref, watch } from "vue";

const KEY = "outline-kanban.collapsed-nodes";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((v) => typeof v === "string"));
  } catch {
    // ignore
  }
  return new Set();
}

function save(set: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // localStorage might be unavailable; non-fatal.
  }
}

const collapsedIds = ref<Set<string>>(load());

watch(collapsedIds, (s) => save(s), { deep: true });

export const collapsedNodeIds = computed(() => collapsedIds.value);

export function isNodeCollapsed(id: string): boolean {
  return collapsedIds.value.has(id);
}

export function collapseNode(id: string) {
  if (!collapsedIds.value.has(id)) {
    collapsedIds.value = new Set([...collapsedIds.value, id]);
  }
}

export function expandNode(id: string) {
  if (collapsedIds.value.has(id)) {
    const next = new Set(collapsedIds.value);
    next.delete(id);
    collapsedIds.value = next;
  }
}

export function toggleNodeCollapsed(id: string) {
  if (collapsedIds.value.has(id)) {
    expandNode(id);
  } else {
    collapseNode(id);
  }
}
