import { computed, ref, watch, type ComputedRef, type InjectionKey } from "vue";

// Injected by KanbanBoard, consumed by OutlinePanel / NodeRow: the set of node
// ids to keep visible under the active tag filter, or null when not filtering.
export const tagFilterVisibleKey: InjectionKey<
  ComputedRef<Set<string> | null>
> = Symbol("tagFilterVisible");

// A board-wide "show only cards tagged with any of these" filter (OR semantics).
// Persisted so a filter survives reloads.
const KEY = "outline-kanban.tag-filter";

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
    // non-fatal
  }
}

const selectedIds = ref<Set<string>>(load());
watch(selectedIds, (s) => save(s), { deep: true });

export const selectedTagIds = computed(() => selectedIds.value);
export const isFiltering = computed(() => selectedIds.value.size > 0);
export const selectedTagCount = computed(() => selectedIds.value.size);

export function isTagSelected(id: string): boolean {
  return selectedIds.value.has(id);
}

export function toggleTagFilter(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

export function clearTagFilter() {
  if (selectedIds.value.size) selectedIds.value = new Set();
}

export function pruneTagFilter(existingIds: string[]) {
  const live = new Set(existingIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selectedIds.value) {
    if (live.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) selectedIds.value = next;
}

/**
 * Given all nodes and the active tag filter, return the set of node ids that
 * should stay visible: every node carrying a selected tag, plus all of its
 * ancestors (so the tree stays navigable). Returns null when no filter is
 * active, meaning "show everything".
 */
export function computeVisibleIds(
  nodes: { id: string; parentId: string | null; tags?: { id: string }[] }[],
): Set<string> | null {
  const sel = selectedIds.value;
  if (sel.size === 0) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = new Set<string>();
  for (const n of nodes) {
    const hit = (n.tags ?? []).some((t) => sel.has(t.id));
    if (!hit) continue;
    // Walk up to the root, marking the whole ancestor chain visible.
    let cur: typeof n | undefined = n;
    while (cur && !visible.has(cur.id)) {
      visible.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return visible;
}
