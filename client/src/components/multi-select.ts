import { computed, ref } from "vue";

// Board-wide multi-selection for bulk edits. Selection is ephemeral (not
// persisted): toggle cards with Space/m, then M-Enter opens the bulk panel.
const ids = ref<Set<string>>(new Set());
const bulkPanelOpen = ref(false);

export const selectedNodeIds = computed(() => ids.value);
export const selectionCount = computed(() => ids.value.size);
export const hasSelection = computed(() => ids.value.size > 0);
export const isBulkPanelOpen = computed(() => bulkPanelOpen.value);

export function isNodeSelected(id: string): boolean {
  return ids.value.has(id);
}

export function toggleSelected(id: string) {
  const next = new Set(ids.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  ids.value = next;
}

export function clearSelection() {
  if (ids.value.size) ids.value = new Set();
}

export function openBulkPanel() {
  if (ids.value.size > 0) bulkPanelOpen.value = true;
}

export function closeBulkPanel() {
  bulkPanelOpen.value = false;
}
