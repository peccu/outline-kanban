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

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  autofocus?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "key-enter": [event: KeyboardEvent];
  "key-tab": [event: KeyboardEvent];
  "key-shift-tab": [event: KeyboardEvent];
  "key-shift-arrow": [event: KeyboardEvent];
  "key-backspace-empty": [event: KeyboardEvent];
  "tag-inserted": [tag: { id: string | null; label: string }];
  blur: [];
  focus: [];
}>();

// Single-line Document
const SingleLineDocument = Document.extend({ content: "paragraph" });

const editor = new Editor({
  content: serializeFromText(props.modelValue),
  autofocus: props.autofocus ? "end" : false,
  editorProps: {
    handleKeyDown: (_view, event) => {
      // We must intercept BEFORE Tiptap's mention popup so suggestions still work
      // when popup is closed.
      if (event.key === "Enter" && !event.isComposing && !event.shiftKey) {
        // If mention popup is open, let it handle.
        if (document.querySelector('[data-tippy-root]')) return false;
        emit("key-enter", event);
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
      if (
        event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        emit("key-shift-arrow", event);
        return true;
      }
      if (event.key === "Backspace") {
        const empty = editor.state.doc.textContent.length === 0;
        if (empty) {
          emit("key-backspace-empty", event);
          return true;
        }
      }
      if (event.key === "Escape") {
        editor.commands.blur();
        // Move focus to the nearest + add button so the user can keep using
        // the keyboard (Tab to other buttons, Enter to add).
        queueMicrotask(() => {
          const el = document.activeElement?.closest("section");
          const btn = el?.querySelector<HTMLButtonElement>(
            'button[data-role="add-node"]',
          );
          btn?.focus();
        });
        return true;
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
  },
  onBlur: () => emit("blur"),
  onFocus: () => emit("focus"),
});

// React to Mention insertions: command emits a synthetic event we capture.
editor.on("transaction", ({ transaction }) => {
  for (const step of transaction.steps) {
    const stepJson = step.toJSON() as { slice?: any };
    if (!stepJson.slice) continue;
    const content = stepJson.slice?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === "mention") {
        emit("tag-inserted", {
          id: c.attrs?.id ?? null,
          label: c.attrs?.label ?? c.attrs?.id ?? "",
        });
      }
    }
  }
});

watch(
  () => props.modelValue,
  (val) => {
    const current = serializeToText(editor.getJSON());
    if (val !== current) {
      editor.commands.setContent(serializeFromText(val), { emitUpdate: false });
    }
  },
);

function serializeToText(doc: any): string {
  // Custom serializer: text nodes verbatim, mentions as "#label".
  const paragraph = doc?.content?.[0];
  if (!paragraph?.content) return "";
  return paragraph.content
    .map((n: any) => {
      if (n.type === "text") return n.text ?? "";
      if (n.type === "mention")
        return `#${n.attrs?.label ?? n.attrs?.id ?? ""}`;
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
