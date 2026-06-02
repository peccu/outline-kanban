<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import OutlinerEditor from "./OutlinerEditor.vue";
import TagPill from "./TagPill.vue";
import CommentItem from "./CommentItem.vue";
import { renderMarkdown } from "@/lib/markdown";
import { useAttachmentTextarea } from "@/lib/attachments";
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
// Description is "edit-mode" by default when the node has no body yet,
// so the user lands on a textarea instead of a blank rendered view.
const bodyEditing = ref(false);
let bodyEditingPrimed = false;
watch(
  () => node.value?.bodyMd,
  (v) => {
    if (v === undefined) return;
    if (body.value !== v) body.value = v ?? "";
    if (!bodyEditingPrimed) {
      bodyEditing.value = !(v ?? "").trim();
      bodyEditingPrimed = true;
    }
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
const titleContainer = ref<HTMLElement | null>(null);

function enterTitleEdit() {
  titleEditing.value = true;
  requestAnimationFrame(() => titleEditorRef.value?.focus());
}

function onTitleContainerKeydown(e: KeyboardEvent) {
  if (titleEditing.value) return; // editor handles its own keys
  if (e.key === "Enter") {
    e.preventDefault();
    enterTitleEdit();
  }
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
  // Mirror org-mode / form flow: confirming the title moves the user straight
  // into the description so they can keep typing without reaching for the mouse.
  // ProseMirror clings to DOM focus across the editable→false transition and
  // can reclaim it after a single focus() call, so blur it and retry focusing
  // the textarea over a few frames (same approach as focus-bus).
  titleEditorRef.value?.blur();
  bodyEditing.value = true;
  focusBodyTextareaSoon();
}

function focusBodyTextareaSoon(attempt = 0) {
  const delays = [0, 16, 50, 150];
  const ta = bodyTextarea.value;
  if (ta) {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
  if (attempt < delays.length - 1) {
    window.setTimeout(() => focusBodyTextareaSoon(attempt + 1), delays[attempt + 1]);
  }
}
function onTitleEscape() {
  // Keyboard-only "save & exit edit": persist the title and drop back to view
  // mode, landing focus on the title container so the user never has to reach
  // for the mouse. ProseMirror reclaims DOM focus across the editable→false
  // flip, so blur it and retry focusing the container over a few frames.
  flushTitleSave();
  titleEditing.value = false;
  titleEditorRef.value?.blur();
  focusTitleContainerSoon();
}

function focusTitleContainerSoon(attempt = 0) {
  const delays = [0, 16, 50, 150];
  titleContainer.value?.focus();
  if (attempt < delays.length - 1) {
    window.setTimeout(
      () => focusTitleContainerSoon(attempt + 1),
      delays[attempt + 1],
    );
  }
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
const newCommentTextarea = ref<HTMLTextAreaElement | null>(null);
const dirtyBody = computed(() => (node.value?.bodyMd ?? "") !== body.value);

// Description is shown as rendered Markdown when there is content and
// we aren't actively editing. dblclick or focus + Enter switches to
// edit mode (textarea). When the body is initially empty the textarea
// is shown directly so the user can start typing immediately
// (bodyEditing is primed above based on the node's saved body).
const bodyTextarea = ref<HTMLTextAreaElement | null>(null);
const bodyView = ref<HTMLElement | null>(null);
const bodyHasContent = computed(() => !!body.value.trim());
const showBodyTextarea = computed(() => bodyEditing.value);
const bodyHtml = computed(() => renderMarkdown(body.value));

async function saveBody() {
  if (!node.value) return;
  await update.mutateAsync({
    id: node.value.id,
    patch: { bodyMd: body.value },
  });
}

async function enterBodyEdit() {
  bodyEditing.value = true;
  await nextTick();
  bodyTextarea.value?.focus();
  // Cursor at end so the user can append.
  const ta = bodyTextarea.value;
  if (ta) ta.selectionStart = ta.selectionEnd = ta.value.length;
}

function leaveBodyEdit() {
  // Only switch to the rendered view if the body actually has content —
  // an empty body keeps the textarea so the user can keep typing.
  if (!bodyHasContent.value) return;
  bodyEditing.value = false;
  requestAnimationFrame(() => bodyView.value?.focus());
}

async function saveBodyAndLeave() {
  await saveBody();
  leaveBodyEdit();
}

function onBodyViewKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enterBodyEdit();
  }
}

function onBodyTextareaKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    // Save & exit *edit* — don't let it bubble to the modal's close-on-Escape.
    e.preventDefault();
    e.stopPropagation();
    void saveBodyAndLeave();
  }
}

// Drop a file onto either textarea, or paste a screenshot from the
// clipboard, and the upload composable inserts a Markdown reference at
// the caret.
useAttachmentTextarea(bodyTextarea, body, { onChange: scheduleBodyAutosave });
useAttachmentTextarea(newCommentTextarea, newComment);

let bodyAutosaveTimer: number | null = null;
function scheduleBodyAutosave() {
  if (bodyAutosaveTimer) window.clearTimeout(bodyAutosaveTimer);
  bodyAutosaveTimer = window.setTimeout(saveBody, 600);
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
let previousFocus: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

function focusableInModal(): HTMLElement[] {
  const root = modalRoot.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
    return;
  }
  if (e.key === "Tab") {
    // Trap Tab inside the modal. Without this, Tab from the last
    // focusable element escapes back to elements behind the modal
    // (lane headers, +add buttons, …) which is confusing.
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
    // If focus is somehow outside the modal, pull it back in.
    if (!active || !root.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && active === first) {
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
  document.addEventListener("keydown", onKeyDown);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    // Land focus on the description area: the textarea if we're going
    // to render one (empty body), otherwise the rendered-markdown view
    // so Enter immediately switches into edit mode.
    const target =
      bodyTextarea.value ?? bodyView.value ?? modalRoot.value;
    target?.focus();
  });
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  document.body.style.overflow = "";
  // Return focus to whatever element opened the modal — typically the
  // card div, so card-focus shortcuts (Enter, ↑↓←→) keep working.
  previousFocus?.focus?.();
});

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
              ref="titleContainer"
              :tabindex="titleEditing ? -1 : 0"
              class="group/title flex items-center gap-2 rounded border border-transparent px-1.5 py-0.5 -mx-1.5 text-base font-medium text-neutral-100 outline-none transition-colors"
              :class="
                titleEditing
                  ? 'border-neutral-500 bg-neutral-900/70 ring-1 ring-neutral-500 cursor-text'
                  : 'cursor-pointer hover:border-neutral-800 hover:bg-neutral-900/50 focus:border-emerald-500/70 focus:bg-neutral-900/60 focus:ring-1 focus:ring-emerald-500/60'
              "
              :title="titleEditing ? '' : 'Enter or double-click to edit'"
              @dblclick="enterTitleEdit"
              @keydown="onTitleContainerKeydown"
            >
              <div class="min-w-0 flex-1">
                <OutlinerEditor
                  ref="titleEditorRef"
                  v-model="title"
                  :editable="titleEditing"
                  placeholder="(untitled — click to edit)"
                  @update:model-value="scheduleTitleSave"
                  @key-enter="onTitleEnter"
                  @key-mod-enter="onTitleEnter"
                  @key-escape="onTitleEscape"
                  @blur="onTitleBlur"
                  @tag-inserted="onTagInserted"
                  @tag-removed="onTagRemoved"
                />
              </div>
              <span
                v-if="!titleEditing"
                aria-hidden="true"
                class="shrink-0 text-xs text-neutral-600 opacity-0 transition-opacity group-hover/title:opacity-100 group-focus/title:opacity-100"
              >
                ✎ edit
              </span>
            </div>
            <ul
              v-if="node?.tags && node.tags.length"
              class="mt-1 flex flex-wrap items-center gap-1"
            >
              <li v-for="t in node.tags" :key="t.id">
                <TagPill :tag="t" editable />
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
                v-if="showBodyTextarea && dirtyBody"
                type="button"
                class="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-800"
                :disabled="update.isPending.value"
                @click="saveBodyAndLeave"
              >
                {{ update.isPending.value ? "saving…" : "save" }}
              </button>
            </div>
            <textarea
              v-if="showBodyTextarea"
              ref="bodyTextarea"
              v-model="body"
              class="min-h-[8rem] w-full resize-y rounded border border-neutral-800 bg-neutral-900/60 p-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
              placeholder="add details…"
              :disabled="nodeLoading"
              @keydown="onBodyTextareaKeydown"
              @keydown.meta.enter.prevent="saveBodyAndLeave"
              @keydown.ctrl.enter.prevent="saveBodyAndLeave"
              @keydown.alt.enter.prevent="saveBodyAndLeave"
            />
            <div
              v-else
              ref="bodyView"
              tabindex="0"
              role="textbox"
              aria-label="description (double-click or press Enter to edit)"
              class="md min-h-[3rem] cursor-text rounded border border-transparent bg-neutral-900/30 p-2 outline-none transition-colors hover:border-neutral-800 hover:bg-neutral-900/50 focus:border-emerald-500/70 focus:bg-neutral-900/60 focus:ring-1 focus:ring-emerald-500/60"
              @dblclick="enterBodyEdit"
              @keydown="onBodyViewKeydown"
              v-html="bodyHtml"
            />
            <div class="mt-1 text-right text-[10px] text-neutral-600">
              <template v-if="showBodyTextarea">
                M-Enter to save · Esc to save & exit
              </template>
              <template v-else>
                double-click or Enter to edit
              </template>
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
              <CommentItem v-for="c in comments" :key="c.id" :comment="c" />
            </ul>
            <div class="mt-3 flex flex-col gap-2">
              <textarea
                ref="newCommentTextarea"
                v-model="newComment"
                class="min-h-[8rem] w-full resize-y rounded border border-neutral-800 bg-neutral-900/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
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
