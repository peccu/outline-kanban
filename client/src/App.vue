<script setup lang="ts">
import { ref } from "vue";
import KanbanBoard from "@/components/KanbanBoard.vue";
import TagManager from "@/components/TagManager.vue";
import BackupRestore from "@/components/BackupRestore.vue";
import { isFiltering, selectedTagCount } from "@/components/tag-filter";

const tagManagerOpen = ref(false);
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      class="flex shrink-0 items-baseline justify-between border-b border-neutral-900 px-4 py-3"
    >
      <h1 class="text-lg font-semibold tracking-tight">outline-kanban</h1>
      <div class="flex items-center gap-3 text-xs text-neutral-500">
        <span class="font-mono">
          ↑↓←→ nav · Enter / dbl-click edit · o open · Tab fold · M-Enter sibling · Tab cycle · M-←→ indent · Shift+←→ move lane
        </span>
        <button
          type="button"
          class="rounded border px-2 py-0.5 transition-colors"
          :class="
            isFiltering
              ? 'border-emerald-600 bg-emerald-500/15 text-emerald-300'
              : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
          "
          @click="tagManagerOpen = true"
        >
          tags<span v-if="isFiltering"> · {{ selectedTagCount }}</span>
        </button>
        <BackupRestore />
        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          class="underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          /docs
        </a>
      </div>
    </header>
    <main class="min-h-0 flex-1 py-3">
      <KanbanBoard />
    </main>
    <TagManager v-if="tagManagerOpen" @close="tagManagerOpen = false" />
  </div>
</template>
