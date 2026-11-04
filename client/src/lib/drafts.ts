import { watch, type Ref } from "vue";

// Unsent text (new comments, comment edits, subtask input…) is mirrored into
// localStorage so that closing the modal, navigating to another card, or
// reloading the page never throws it away. Re-opening the same place restores
// it. Empty text removes the entry, so a successful post/save (which clears the
// field) also clears the stored draft.

const PREFIX = "outline-kanban:draft:";

export function loadDraft(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(key: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(PREFIX + key, value);
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage full / disabled — drafts are best-effort.
  }
}

export function clearDraft(key: string) {
  saveDraft(key, "");
}

/**
 * Bind `text` to a localStorage draft identified by `key()`. Whenever the key
 * changes (e.g. the modal drills into another node) the stored draft for the
 * new key is loaded into `text`; every edit to `text` is written back.
 */
export function usePersistentDraft(key: () => string | null, text: Ref<string>) {
  let current: string | null = null;
  watch(
    key,
    (k) => {
      current = k;
      text.value = k ? loadDraft(k) : "";
    },
    { immediate: true },
  );
  watch(text, (v) => {
    if (current) saveDraft(current, v);
  });
}
