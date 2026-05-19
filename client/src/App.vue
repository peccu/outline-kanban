<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

type Health = { status: "ok"; uptime: number };

const { data, isPending, isError, error, refetch, isFetching } = useQuery({
  queryKey: ["health"],
  queryFn: async (): Promise<Health> => {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  refetchInterval: 5000,
});
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
        backend health
      </h2>

      <div v-if="isPending" class="text-neutral-400">checking…</div>

      <div v-else-if="isError" class="text-red-400">
        error: {{ (error as Error).message }}
      </div>

      <dl v-else class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-neutral-400">status</dt>
        <dd class="font-mono text-emerald-400">{{ data?.status }}</dd>
        <dt class="text-neutral-400">uptime</dt>
        <dd class="font-mono">{{ data?.uptime.toFixed(1) }}s</dd>
      </dl>

      <button
        class="mt-4 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        :disabled="isFetching"
        @click="() => refetch()"
      >
        {{ isFetching ? "refetching…" : "refetch" }}
      </button>
    </section>

    <p class="text-xs text-neutral-500">
      scaffold only — outliner / kanban UI と DB は次のステップで実装します。
    </p>
  </main>
</template>
