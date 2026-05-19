<script setup lang="ts">
import { useLanes } from "@/api/queries";

const { data: lanes, isPending, isError, error } = useLanes();
</script>

<template>
  <main class="mx-auto flex h-full max-w-3xl flex-col gap-6 p-8">
    <header class="flex items-baseline justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">outline-kanban</h1>
      <a
        href="/docs"
        target="_blank"
        rel="noreferrer"
        class="text-sm text-neutral-400 underline-offset-4 hover:text-neutral-100 hover:underline"
      >
        /docs
      </a>
    </header>

    <section
      class="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
    >
      <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">
        lanes
      </h2>
      <div v-if="isPending" class="text-neutral-400">loading…</div>
      <div v-else-if="isError" class="text-red-400">
        {{ (error as Error).message }}
      </div>
      <ul v-else class="flex flex-wrap gap-2">
        <li
          v-for="lane in lanes"
          :key="lane.id"
          class="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        >
          <span
            class="inline-block size-2.5 rounded-full"
            :style="{ background: lane.color ?? '#525252' }"
          />
          {{ lane.name }}
          <span class="font-mono text-xs text-neutral-500">{{ lane.sortKey }}</span>
        </li>
      </ul>
    </section>

    <p class="text-xs text-neutral-500">
      typed API client is wired. Outliner / Kanban UI を次に実装します。
    </p>
  </main>
</template>
