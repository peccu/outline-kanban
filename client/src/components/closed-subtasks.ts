import { computed, ref, watch, type ComputedRef, type InjectionKey, type Ref } from "vue";

const KEY = "outline-kanban.hide-closed-subtasks";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export const hideClosedSubtasks = ref<boolean>(load());

watch(hideClosedSubtasks, (v) => {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // non-fatal
  }
});

export const isHidingClosedSubtasks = computed(() => hideClosedSubtasks.value);

export function toggleHideClosedSubtasks() {
  hideClosedSubtasks.value = !hideClosedSubtasks.value;
}

// Provided by KanbanBoard, consumed by NodeRow: computed Set of lane IDs whose
// isClosed flag is true. Null-safe: defaults to empty set when not injected.
export const closedLaneIdsKey: InjectionKey<ComputedRef<Set<string>>> =
  Symbol("closedLaneIds");

export const hideClosedSubtasksKey: InjectionKey<Ref<boolean>> =
  Symbol("hideClosedSubtasks");
