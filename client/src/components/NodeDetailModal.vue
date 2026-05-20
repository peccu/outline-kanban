<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import OutlinerEditor from "./OutlinerEditor.vue";
import {
  useAddComment,
  useAttachTag,
  useComments,
  useDetachTag,
  useNode,
  useUpdateNode,
} from "@/api/queries";
import type { NodeStatus } from "@/api/client";

const STATUS_LABEL: Record<NodeStatus, string> = {
  open: "open",
  doing: "doing",
  done: "done",
  blocked: "blocked",
};
const STATUS_COLOR: Record<NodeStatus, string> = {
  open: "bg-neutral-600",
  doing: "bg-blue-500",
  done: "bg-emerald-500",
  blocked: "bg-rose-500",
};
const STATUSES: NodeStatus[] = ["open", "doing", "done", "blocked"];

const props = defineProps<{
  nodeId: string;
}>();
const emit = defineEmits<{ close: [] }>();

const idRef = computed(() => props.nodeId);
const { data: node, isPending: nodeLoading } = useNode(idRef);
const { data: comments, isPending: commentsLoading } = useComments(idRef);

const update = useUpdateNode();
const add = useAddComment();
const attach = useAttachTag();
const detach = useDetachTag();

const body = ref("");
watch(
  () => node.value?.bodyMd,
  (v) => {
    if (v !== undefined && body.value !== v) body.value = v ?? "";
  },
  { immediate: true },
);

const title = ref("");
watch(
  () => node.value?.title,
  (v) => {
    if (v !== undefined && title.value !== v) title.value = v ?? "";
  },
  { immediate: true },
);

const titleEditing = ref(false);
const titleEditorRef = ref<InstanceType<typeof OutlinerEditor> | null>(null);

function enterTitleEdit() {
  titleEditing.value = true;
  requestAnimationFrame(() => titleEditorRef.value?.focus());
}

let titleSaveTimer: number | null = null;
function scheduleTitleSave() {
  if (titleSaveTimer) window.clearTimeout(titleSaveTimer);
  titleSaveTimer = window.setTimeout(flushTitleSave, 400);
}
function flushTitleSave() {
  if (titleSaveTimer) {
    window.clearTimeout(titleSaveTimer);
    titleSaveTimer = null;
  }
  if (!node.value) return;
  if (title.value !== node.value.title) {
    update.mutate({ id: node.value.id, patch: { title: title.value } });
  }
}
function onTitleEnter() {
  flushTitleSave();
  titleEditing.value = false;
}
function onTitleEscape() {
  flushTitleSave();
  titleEditing.value = false;
}
function onTitleBlur() {
  if (!titleEditing.value) return;
  flushTitleSave();
  titleEditing.value = false;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onTagInserted(t: { id: string | null; label: string }) {
  if (!node.value) return;
  if (t.id && UUID_RE.test(t.id)) {
    attach.mutate({ nodeId: node.value.id, tag: { tagId: t.id } });
  } else {
    attach.mutate({ nodeId: node.value.id, tag: { name: t.label } });
  }
}
function onTagRemoved(t: { id: string | null; label: string }) {
  if (!node.value) return;
  let tagId: string | null = null;
  if (t.id && UUID_RE.test(t.id)) tagId = t.id;
  else {
    const match = (node.value.tags ?? []).find((tag) => tag.name === t.label);
    if (match) tagId = match.id;
  }
  if (!tagId) return;
  detach.mutate({ nodeId: node.value.id, tagId });
}

const newComment = ref("");
const dirtyBody = computed(() => (node.value?.bodyMd ?? "") !== body.value);

async function saveBody() {
  if (!node.value) return;
  await update.mutateAsync({
    id: node.value.id,
    patch: { bodyMd: body.value },
  });
}

async function postComment() {
  const text = newComment.value.trim();
  if (!text) return;
  await add.mutateAsync({ nodeId: props.nodeId, bodyMd: text });
  newComment.value = "";
}

function setStatus(s: NodeStatus) {
  if (!node.value || node.value.status === s) return;
  update.mutate({ id: node.value.id, patch: { status: s } });
}

const modalRoot = ref<HTMLElement | null>(null);
const bodyTextarea = ref<HTMLTextAreaElement | null>(null);
let previousFocus: HTMLElement | null = null;

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  document.addEventListener("keydown", onKeyDown);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    // Focus the description textarea so the user can start typing
    // notes immediately. Fall back to the modal root if it isn't
    // mounted yet (shouldn't happen, but stays accessible).
    (bodyTextarea.value ?? modalRoot.value)?.focus();
  });
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  document.body.style.overflow = "";
  // Return focus to whatever element opened the modal — typically the
  // card div, so card-focus shortcuts (Enter, ↑↓←→) keep working.
  previousFocus?.focus?.();
});

function fmt(ts: string | Date | undefined | null) {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString();
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="emit('close')"
    >
      <div
        ref="modalRoot"
        tabindex="-1"
        class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl outline-none"
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3"
        >
          <div class="min-w-0 flex-1">
            <div
              class="text-xs uppercase tracking-wide text-neutral-500"
            >
              card
            </div>
            <div
              class="text-base font-medium text-neutral-100"
              :title="title || '(untitled)'"
              @dblclick="enterTitleEdit"
            >
              <OutlinerEditor
                ref="titleEditorRef"
                v-model="title"
                :editable="titleEditing"
                placeholder="(untitled)"
                @update:model-value="scheduleTitleSave"
                @key-enter="onTitleEnter"
                @key-mod-enter="onTitleEnter"
                @key-escape="onTitleEscape"
                @blur="onTitleBlur"
                @tag-inserted="onTagInserted"
                @tag-removed="onTagRemoved"
              />
            </div>
            <ul
              v-if="node?.tags && node.tags.length"
              class="mt-1 flex flex-wrap gap-1"
            >
              <li
                v-for="t in node.tags"
                :key="t.id"
                class="rounded bg-emerald-500/10 px-1.5 py-0 text-[10px] font-mono text-emerald-300"
              >
                #{{ t.name }}
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
            aria-label="close"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div
          class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4"
        >
          <section>
            <div class="mb-1.5 flex items-center justify-between">
              <h3
                class="text-xs font-medium uppercase tracking-wide text-neutral-400"
              >
                status
              </h3>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="s in STATUSES"
                :key="s"
                type="button"
                class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                :class="
                  node?.status === s
                    ? 'border-neutral-600 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                "
                @click="setStatus(s)"
              >
                <span
                  class="inline-block size-2 rounded-full"
                  :class="STATUS_COLOR[s]"
                />
                {{ STATUS_LABEL[s] }}
              </button>
            </div>
          </section>

          <section>
            <div class="mb-1.5 flex items-center justify-between">
              <h3
                class="text-xs font-medium uppercase tracking-wide text-neutral-400"
              >
                description (markdown)
              </h3>
              <button
                v-if="dirtyBody"
                type="button"
                class="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-800"
                :disabled="update.isPending.value"
                @click="saveBody"
              >
                {{ update.isPending.value ? "saving…" : "save" }}
              </button>
            </div>
            <textarea
              ref="bodyTextarea"
              v-model="body"
              class="min-h-[8rem] w-full resize-y rounded border border-neutral-800 bg-neutral-900/60 p-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
              placeholder="add details…"
              :disabled="nodeLoading"
              @keydown.meta.enter.prevent="saveBody"
              @keydown.ctrl.enter.prevent="saveBody"
              @keydown.alt.enter.prevent="saveBody"
            />
            <div class="mt-1 text-right text-[10px] text-neutral-600">
              M-Enter to save
            </div>
          </section>

          <section>
            <h3
              class="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400"
            >
              comments
              <span class="text-neutral-600">({{ comments?.length ?? 0 }})</span>
            </h3>
            <div v-if="commentsLoading" class="text-xs text-neutral-500">
              loading…
            </div>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="c in comments"
                :key="c.id"
                class="rounded border border-neutral-800 bg-neutral-900/40 p-2"
              >
                <div class="text-[10px] uppercase tracking-wide text-neutral-500">
                  {{ fmt(c.createdAt) }}
                </div>
                <pre
                  class="mt-0.5 whitespace-pre-wrap font-sans text-sm text-neutral-100"
                  >{{ c.bodyMd }}</pre>
              </li>
            </ul>
            <div class="mt-3 flex flex-col gap-2">
              <textarea
                v-model="newComment"
                class="min-h-[4rem] w-full resize-y rounded border border-neutral-800 bg-neutral-900/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                placeholder="add a comment…"
                @keydown.meta.enter.prevent="postComment"
                @keydown.ctrl.enter.prevent="postComment"
              />
              <div class="flex items-center justify-end gap-2">
                <span class="text-[10px] text-neutral-600">
                  M-Enter to send
                </span>
                <button
                  type="button"
                  class="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="!newComment.trim() || add.isPending.value"
                  @click="postComment"
                >
                  {{ add.isPending.value ? "sending…" : "post" }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
