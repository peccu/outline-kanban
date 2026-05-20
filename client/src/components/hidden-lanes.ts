import { computed, ref, watch } from "vue";

const KEY = "outline-kanban.hidden-lanes";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((v) => typeof v === "string"));
  } catch {
    // ignore — fall through to empty set
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

const hiddenIds = ref<Set<string>>(load());

watch(
  hiddenIds,
  (s) => save(s),
  { deep: true },
);

export const hiddenLaneIds = computed(() => hiddenIds.value);

export function isLaneHidden(id: string): boolean {
  return hiddenIds.value.has(id);
}

export function hideLane(id: string) {
  if (!hiddenIds.value.has(id)) {
    hiddenIds.value = new Set([...hiddenIds.value, id]);
  }
}

export function showLane(id: string) {
  if (hiddenIds.value.has(id)) {
    const next = new Set(hiddenIds.value);
    next.delete(id);
    hiddenIds.value = next;
  }
}

export function clearHidden(idsThatExist: string[]) {
  // Drop entries for lanes that no longer exist (e.g. deleted while hidden).
  const live = new Set(idsThatExist);
  let changed = false;
  const next = new Set<string>();
  for (const id of hiddenIds.value) {
    if (live.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) hiddenIds.value = next;
}
