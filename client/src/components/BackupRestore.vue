<script setup lang="ts">
import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";

const qc = useQueryClient();
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);

function pickRestoreFile() {
  message.value = null;
  fileInput.value?.click();
}

async function onRestoreFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-selecting the same file later
  if (!file) return;
  if (
    !confirm(
      "Restore from this backup? This replaces ALL current lanes, cards, tags, comments and attachments.",
    )
  ) {
    return;
  }
  busy.value = true;
  message.value = "restoring…";
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/restore", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || body.error || `HTTP ${res.status}`);
    }
    const summary = await res.json();
    message.value = `restored ${summary.nodes} cards`;
    // Refresh everything from the new data.
    await qc.invalidateQueries();
  } catch (err) {
    message.value = `restore failed: ${String(err)}`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <a
      href="/api/backup"
      class="rounded border border-neutral-800 px-2 py-0.5 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100"
      title="Download a ZIP backup (data + attachments)"
    >
      backup
    </a>
    <button
      type="button"
      class="rounded border border-neutral-800 px-2 py-0.5 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-50"
      :disabled="busy"
      title="Restore from a ZIP backup (replaces all data)"
      @click="pickRestoreFile"
    >
      restore
    </button>
    <input
      ref="fileInput"
      type="file"
      accept=".zip,application/zip"
      class="hidden"
      @change="onRestoreFile"
    />
    <span v-if="message" class="text-[11px] text-neutral-500">{{ message }}</span>
  </div>
</template>
