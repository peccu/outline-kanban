<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { renderMarkdown } from "@/lib/markdown";
import { useAttachmentTextarea } from "@/lib/attachments";
import { useDeleteComment, useUpdateComment } from "@/api/queries";
import type { Comment } from "@/api/client";

const props = defineProps<{ comment: Comment }>();

const editing = ref(false);
const draft = ref(props.comment.bodyMd);
const rootEl = ref<HTMLLIElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const update = useUpdateComment();
const del = useDeleteComment();

const bodyHtml = computed(() => renderMarkdown(props.comment.bodyMd));

function fmt(ts: string | Date | null | undefined) {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString();
}

async function enterEdit() {
  draft.value = props.comment.bodyMd;
  editing.value = true;
  await nextTick();
  const ta = textareaRef.value;
  if (ta) {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
}

function cancelEdit() {
  editing.value = false;
  draft.value = props.comment.bodyMd;
  requestAnimationFrame(() => rootEl.value?.focus());
}

async function saveEdit() {
  const next = draft.value.trim();
  if (!next) return; // empty body → ignore (server min: 1)
  if (next === props.comment.bodyMd) {
    cancelEdit();
    return;
  }
  await update.mutateAsync({
    id: props.comment.id,
    nodeId: props.comment.nodeId,
    bodyMd: next,
  });
  editing.value = false;
  requestAnimationFrame(() => rootEl.value?.focus());
}

function doDelete() {
  if (!confirm("Delete this comment?")) return;
  del.mutate({ id: props.comment.id, nodeId: props.comment.nodeId });
}

function onRootKeydown(e: KeyboardEvent) {
  if (editing.value) return;
  // Only react when focus is on the <li> itself, not on a child button
  // or link inside the rendered Markdown.
  if (e.target !== rootEl.value) return;
  if (e.key === "Enter" || e.key === "e") {
    e.preventDefault();
    enterEdit();
  } else if ((e.key === "Backspace" || e.key === "Delete") && !e.repeat) {
    e.preventDefault();
    doDelete();
  }
}

function onTextareaKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
  } else if (
    e.key === "Enter" &&
    (e.metaKey || e.ctrlKey || e.altKey) &&
    !e.shiftKey
  ) {
    e.preventDefault();
    void saveEdit();
  }
}

useAttachmentTextarea(textareaRef, draft);

onBeforeUnmount(() => {
  // No-op: useAttachmentTextarea wires its own cleanup.
});
</script>

<template>
  <li
    ref="rootEl"
    :tabindex="editing ? -1 : 0"
    class="group/comment rounded border border-neutral-800 bg-neutral-900/40 p-2 outline-none transition-colors focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/60"
    @keydown="onRootKeydown"
  >
    <div class="flex items-baseline justify-between gap-2">
      <div class="text-[10px] uppercase tracking-wide text-neutral-500">
        {{ fmt(comment.createdAt) }}
      </div>
      <div
        v-if="!editing"
        class="flex shrink-0 gap-1 text-[10px] text-neutral-500 opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus/comment:opacity-100"
        aria-hidden="false"
      >
        <button
          type="button"
          class="rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-neutral-200"
          title="edit (Enter)"
          @click="enterEdit"
        >
          ✎ edit
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-rose-300"
          title="delete (Del)"
          @click="doDelete"
        >
          🗑 del
        </button>
      </div>
    </div>

    <div
      v-if="!editing"
      class="md mt-0.5 cursor-text"
      @dblclick="enterEdit"
      v-html="bodyHtml"
    />
    <template v-else>
      <textarea
        ref="textareaRef"
        v-model="draft"
        class="mt-1 min-h-[4rem] w-full resize-y rounded border border-neutral-800 bg-neutral-900/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
        placeholder="edit comment…"
        @keydown="onTextareaKeydown"
      />
      <div class="mt-1 flex items-center justify-between text-[10px] text-neutral-600">
        <span>M-Enter to save · Esc to cancel</span>
        <div class="flex gap-1">
          <button
            type="button"
            class="rounded border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
            @click="cancelEdit"
          >
            cancel
          </button>
          <button
            type="button"
            class="rounded border border-neutral-700 px-2 py-0.5 text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
            :disabled="update.isPending.value || !draft.trim()"
            @click="saveEdit"
          >
            {{ update.isPending.value ? "saving…" : "save" }}
          </button>
        </div>
      </div>
    </template>
  </li>
</template>
