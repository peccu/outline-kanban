<script setup lang="ts">
import KanbanBoard from "@/components/KanbanBoard.vue";
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      class="flex shrink-0 items-baseline justify-between border-b border-neutral-900 px-4 py-3"
    >
      <h1 class="text-lg font-semibold tracking-tight">outline-kanban</h1>
      <div class="flex items-center gap-3 text-xs text-neutral-500">
        <span class="font-mono">
          Enter confirm · ↑↓←→ nav · o open · M-Enter sibling · Tab cycle · M-←→ indent · Shift+←→ move lane
        </span>
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
  </div>
</template>
