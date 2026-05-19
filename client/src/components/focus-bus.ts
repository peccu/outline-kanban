import { ref } from "vue";

export const pendingFocusNodeId = ref<string | null>(null);

export function requestFocus(id: string) {
  pendingFocusNodeId.value = id;
}

export function clearFocus() {
  pendingFocusNodeId.value = null;
}
