// Drop-files / paste-images → upload to /api/attachments → insert
// Markdown reference into a textarea. Image MIME types become
// ![filename](url); everything else becomes [filename](url).

import { onBeforeUnmount, watch, type Ref } from "vue";

export type UploadedAttachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
};

export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file, file.name || "attachment");
  const res = await fetch("/api/attachments", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload failed: ${res.status} ${text}`);
  }
  return (await res.json()) as UploadedAttachment;
}

function markdownFor(att: UploadedAttachment): string {
  const isImage = att.mime.startsWith("image/");
  const label = att.filename || "attachment";
  return isImage ? `![${label}](${att.url})` : `[${label}](${att.url})`;
}

// Best-effort default filename for clipboard images, which arrive with
// `file.name === ""` on most browsers.
function fileNameFor(file: File, fallbackIndex: number): string {
  if (file.name) return file.name;
  const ext = file.type.split("/")[1] ?? "bin";
  return `paste-${Date.now()}-${fallbackIndex}.${ext}`;
}

type Options = {
  // Notified when the textarea value changed (so the parent can run any
  // side effects like debounced save). Receives the new value.
  onChange?: (value: string) => void;
};

// Wire `paste` / `drop` / `dragover` handlers onto a textarea. When files
// arrive we insert a temporary placeholder at the caret, kick off the
// upload(s) in parallel, then replace the placeholder with the final
// Markdown link as each one finishes (so multiple drops are independent).
export function useAttachmentTextarea(
  textareaRef: Ref<HTMLTextAreaElement | null>,
  modelRef: Ref<string>,
  opts: Options = {},
) {
  let counter = 0;

  function nextPlaceholder(name: string): string {
    counter += 1;
    // A *whole-line* placeholder we'll find-and-replace as one unit, so
    // there are no nested Markdown brackets when the upload completes.
    // The trailing zero-width invisibles make accidental collisions
    // with user-typed text effectively impossible.
    return `[⁣uploading ${name} #${Date.now()}-${counter}⁣]`;
  }

  function updateValue(next: string) {
    modelRef.value = next;
    opts.onChange?.(next);
  }

  function insertAtCaret(insertion: string) {
    const ta = textareaRef.value;
    if (!ta) {
      updateValue(modelRef.value + insertion);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = modelRef.value.slice(0, start);
    const after = modelRef.value.slice(end);
    const next = before + insertion + after;
    updateValue(next);
    // Restore caret position right after the inserted text on next tick.
    requestAnimationFrame(() => {
      const t = textareaRef.value;
      if (!t) return;
      const pos = before.length + insertion.length;
      t.focus();
      t.setSelectionRange(pos, pos);
    });
  }

  function replaceToken(token: string, replacement: string) {
    const cur = modelRef.value;
    const idx = cur.indexOf(token);
    if (idx < 0) {
      // Token was edited away — append at the end instead of dropping it.
      updateValue(cur + (cur.endsWith("\n") ? "" : "\n") + replacement);
      return;
    }
    updateValue(cur.slice(0, idx) + replacement + cur.slice(idx + token.length));
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return;
    // Insert all placeholders first in one shot so caret math stays simple.
    const placeholders = files.map((f, i) => nextPlaceholder(fileNameFor(f, i)));
    insertAtCaret(placeholders.join("\n"));

    await Promise.all(
      files.map(async (file, i) => {
        const placeholder = placeholders[i]!;
        try {
          const att = await uploadAttachment(file);
          const named: UploadedAttachment = att.filename
            ? att
            : { ...att, filename: fileNameFor(file, i) };
          replaceToken(placeholder, markdownFor(named));
        } catch (err) {
          console.error("[attachments]", err);
          replaceToken(
            placeholder,
            `<!-- upload failed: ${(err as Error).message} -->`,
          );
        }
      }),
    );
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void processFiles(files);
  }

  function onDrop(e: DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    void processFiles(Array.from(files));
  }

  function onDragOver(e: DragEvent) {
    // Only swallow drags that are bringing files in — keep card DnD
    // working if a card happens to pass over the textarea.
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function attach(ta: HTMLTextAreaElement | null) {
    if (!ta) return;
    ta.addEventListener("paste", onPaste);
    ta.addEventListener("drop", onDrop);
    ta.addEventListener("dragover", onDragOver);
  }
  function detach(ta: HTMLTextAreaElement | null) {
    if (!ta) return;
    ta.removeEventListener("paste", onPaste);
    ta.removeEventListener("drop", onDrop);
    ta.removeEventListener("dragover", onDragOver);
  }

  const stop = watch(
    textareaRef,
    (ta, prev) => {
      if (prev) detach(prev);
      attach(ta);
    },
    { immediate: true, flush: "post" },
  );

  onBeforeUnmount(() => {
    detach(textareaRef.value);
    stop();
  });
}
