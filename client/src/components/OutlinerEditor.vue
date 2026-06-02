<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { Editor, EditorContent } from "@tiptap/vue-3";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Mention from "@tiptap/extension-mention";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import { buildTagSuggestion } from "./mention-suggestion";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    autofocus?: boolean;
    editable?: boolean;
  }>(),
  { editable: true },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "key-enter": [event: KeyboardEvent];
  "key-mod-enter": [event: KeyboardEvent];
  "key-tab": [event: KeyboardEvent];
  "key-shift-tab": [event: KeyboardEvent];
  "key-mod-arrow-left": [event: KeyboardEvent];
  "key-mod-arrow-right": [event: KeyboardEvent];
  "key-shift-arrow": [event: KeyboardEvent];
  "key-backspace-empty": [event: KeyboardEvent];
  "user-input": [];
  "key-escape": [event: KeyboardEvent];
  "tag-inserted": [tag: { id: string | null; label: string }];
  "tag-removed": [tag: { id: string | null; label: string }];
  blur: [];
  focus: [];
}>();

// Single-line Document
const SingleLineDocument = Document.extend({ content: "paragraph" });

const editor = new Editor({
  content: serializeFromText(props.modelValue),
  autofocus: props.autofocus ? "end" : false,
  editable: props.editable,
  editorProps: {
    handleKeyDown: (_view, event) => {
      const mod = event.altKey || event.metaKey;
      // We must intercept BEFORE Tiptap's mention popup so suggestions still work
      // when popup is closed.
      if (event.key === "Enter" && !event.isComposing && !event.shiftKey) {
        // If mention popup is open, let it handle.
        if (document.querySelector('[data-tippy-root]')) return false;
        if (mod) emit("key-mod-enter", event);
        else emit("key-enter", event);
        return true;
      }
      if (event.key === "Tab" && !event.shiftKey) {
        emit("key-tab", event);
        return true;
      }
      if (event.key === "Tab" && event.shiftKey) {
        emit("key-shift-tab", event);
        return true;
      }
      if (mod && event.key === "ArrowLeft") {
        emit("key-mod-arrow-left", event);
        return true;
      }
      if (mod && event.key === "ArrowRight") {
        emit("key-mod-arrow-right", event);
        return true;
      }
      if (
        event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        emit("key-shift-arrow", event);
        return true;
      }
      if (event.key === "Backspace") {
        const empty = editor.state.doc.textContent.length === 0;
        // Only trigger card-delete on a *fresh* Backspace press — a
        // held-down auto-repeat that drained the title shouldn't tear
        // the card out from under the user and start eating the
        // previous card's title.
        if (empty && !event.repeat) {
          emit("key-backspace-empty", event);
          return true;
        }
        if (empty) return true; // swallow the repeat; nothing more to delete
      }
      if (event.key === "Escape") {
        // Escape here means "leave the inline editor", not "close whatever is
        // behind it". Stop it from bubbling to document-level handlers (e.g.
        // the detail modal's close-on-Escape) so the user can exit title/body
        // edit by keyboard without dismissing the modal.
        event.stopPropagation();
        editor.commands.blur();
        emit("key-escape", event);
        return true;
      }
      // Any other key: signal the parent that the user is typing so cycle
      // state (e.g. Tab cycle) can reset. Ignore pure modifier presses and
      // arrow movement.
      if (
        event.key.length === 1 ||
        event.key === "Backspace" ||
        event.key === "Delete"
      ) {
        emit("user-input");
      }
      return false;
    },
  },
  extensions: [
    SingleLineDocument,
    Paragraph,
    Text,
    History,
    Placeholder.configure({
      placeholder: props.placeholder ?? "",
    }),
    Mention.configure({
      HTMLAttributes: {
        class:
          "rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-300 text-[0.95em]",
      },
      renderText({ node }) {
        return `#${node.attrs.label ?? node.attrs.id}`;
      },
      suggestion: buildTagSuggestion(),
    }),
  ],
  onUpdate({ editor }) {
    emit("update:modelValue", serializeToText(editor.getJSON()));
    diffMentions();
  },
  onBlur: () => emit("blur"),
  onFocus: () => emit("focus"),
});

type MentionEntry = { id: string | null; label: string };

function collectMentions(doc: any): MentionEntry[] {
  const out: MentionEntry[] = [];
  const para = doc?.content?.[0];
  if (!para?.content) return out;
  for (const n of para.content as any[]) {
    if (n.type === "mention") {
      out.push({
        id: n.attrs?.id ?? null,
        label: n.attrs?.label ?? n.attrs?.id ?? "",
      });
    }
  }
  return out;
}

const keyOf = (m: MentionEntry) => `${m.id ?? ""}|${m.label}`;

let lastMentions = new Map<string, MentionEntry>();
{
  const initial = collectMentions(editor.getJSON());
  for (const m of initial) lastMentions.set(keyOf(m), m);
}

function diffMentions() {
  const current = collectMentions(editor.getJSON());
  const currentMap = new Map<string, MentionEntry>();
  for (const m of current) currentMap.set(keyOf(m), m);

  for (const [k, m] of currentMap) {
    if (!lastMentions.has(k)) emit("tag-inserted", m);
  }
  for (const [k, m] of lastMentions) {
    if (!currentMap.has(k)) emit("tag-removed", m);
  }
  lastMentions = currentMap;
}

watch(
  () => props.editable,
  (val) => editor.setEditable(val),
);

watch(
  () => props.modelValue,
  (val) => {
    // While the editor is focused the user's local content is the source of
    // truth. A save round-trip invalidates the node queries and feeds the
    // (possibly stale) server value back through here; calling setContent in
    // that window resets the cursor and drops characters typed in the
    // meantime (the "kanban eats a character" bug). Re-sync only once focus
    // has left — by then scheduleSave/flushSave has persisted the latest.
    if (editor.isFocused) return;
    const current = serializeToText(editor.getJSON());
    if (val !== current) {
      editor.commands.setContent(serializeFromText(val), { emitUpdate: false });
      // External title update — refresh the mention snapshot without emitting
      // spurious tag-added / tag-removed events.
      lastMentions = new Map();
      for (const m of collectMentions(editor.getJSON())) {
        lastMentions.set(keyOf(m), m);
      }
    }
  },
);

function serializeToText(doc: any): string {
  // Custom serializer: text nodes verbatim. Mentions are *not* written back
  // into the title — a tag's canonical home is the node_tags table (shown as a
  // pill), so the persisted title stays clean rather than duplicating "#label"
  // inline. The mention chip still shows in the editor until the row remounts.
  const paragraph = doc?.content?.[0];
  if (!paragraph?.content) return "";
  return paragraph.content
    .map((n: any) => {
      if (n.type === "text") return n.text ?? "";
      return "";
    })
    .join("");
}

function serializeFromText(text: string): any {
  // Parse "...#tagname..." into mention nodes for re-display.
  const pieces: any[] = [];
  const re = /#([\p{L}\p{N}_-]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      pieces.push({ type: "text", text: text.slice(last, m.index) });
    }
    pieces.push({
      type: "mention",
      attrs: { id: m[1], label: m[1] },
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", text: text.slice(last) });
  return {
    type: "doc",
    content: [{ type: "paragraph", content: pieces }],
  };
}

defineExpose({
  focus: () => editor.commands.focus("end"),
  blur: () => editor.commands.blur(),
});

onBeforeUnmount(() => editor.destroy());
</script>

<template>
  <EditorContent
    :editor="editor"
    class="prose prose-invert max-w-none focus:outline-none [&_p]:m-0 [&_p]:min-h-[1.4em] [&_.is-editor-empty]:before:text-neutral-600 [&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:absolute"
    :class="editable ? '' : 'pointer-events-none select-none'"
  />
</template>

<style>
.tippy-box[data-theme~="outline-kanban"] {
  background: transparent;
  box-shadow: none;
}
.tippy-box[data-theme~="outline-kanban"] .tippy-content {
  padding: 0;
}
</style>
