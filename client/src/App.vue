<script setup lang="ts">
import { computed } from "vue";
import OutlinePanel from "@/components/OutlinePanel.vue";
import { useLanes } from "@/api/queries";

const { data: lanes, isPending } = useLanes();
const todayLane = computed(() =>
  (lanes.value ?? []).find((l) => l.name === "Today") ?? lanes.value?.[0],
);
</script>

<template>
  <main class="mx-auto flex h-full max-w-2xl flex-col gap-6 p-8">
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

    <div v-if="isPending" class="text-neutral-400">loading lanes…</div>

    <section
      v-else-if="todayLane"
      class="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
    >
      <div class="mb-2 flex items-center gap-2">
        <span
          class="inline-block size-2.5 rounded-full"
          :style="{ background: todayLane.color ?? '#525252' }"
        />
        <h2 class="text-sm font-medium uppercase tracking-wide text-neutral-300">
          {{ todayLane.name }}
        </h2>
      </div>
      <OutlinePanel :lane-id="todayLane.id" />
    </section>

    <p class="text-xs text-neutral-500">
      Tab/Shift-Tab で indent、Enter で兄弟追加、Backspace で空ノード削除、
      <span class="font-mono">#tag</span> で Mention 候補が出ます。
    </p>
  </main>
</template>
