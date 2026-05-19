<script setup lang="ts">
import { ref } from "vue";
import type { Tag } from "@/api/client";

const props = defineProps<{
  items: Tag[];
  query: string;
  command: (item: { id: string | null; label: string }) => void;
}>();

const selected = ref(0);

defineExpose({
  onKeyDown(event: KeyboardEvent): boolean {
    const total = props.items.length + (props.query ? 1 : 0);
    if (total === 0) return false;
    if (event.key === "ArrowDown") {
      selected.value = (selected.value + 1) % total;
      return true;
    }
    if (event.key === "ArrowUp") {
      selected.value = (selected.value - 1 + total) % total;
      return true;
    }
    if (event.key === "Enter") {
      pick(selected.value);
      return true;
    }
    return false;
  },
  setQuery(_: string) {
    selected.value = 0;
  },
});

function pick(i: number) {
  if (i < props.items.length) {
    const t = props.items[i]!;
    props.command({ id: t.id, label: t.name });
  } else if (props.query) {
    props.command({ id: null, label: props.query });
  }
}
</script>

<template>
  <div
    class="min-w-[10rem] rounded-md border border-neutral-700 bg-neutral-900 text-sm shadow-lg"
  >
    <button
      v-for="(item, i) in items"
      :key="item.id"
      type="button"
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-800"
      :class="i === selected ? 'bg-neutral-800' : ''"
      @click="pick(i)"
    >
      <span
        class="inline-block size-2 rounded-full"
        :style="{ background: item.color ?? '#737373' }"
      />
      <span>{{ item.name }}</span>
    </button>
    <button
      v-if="query"
      type="button"
      class="flex w-full items-center gap-2 border-t border-neutral-800 px-3 py-1.5 text-left text-neutral-300 hover:bg-neutral-800"
      :class="items.length === selected ? 'bg-neutral-800' : ''"
      @click="pick(items.length)"
    >
      <span class="text-emerald-400">+</span>
      <span>create <span class="font-mono">#{{ query }}</span></span>
    </button>
    <div
      v-if="items.length === 0 && !query"
      class="px-3 py-1.5 text-neutral-500"
    >
      type a tag name…
    </div>
  </div>
</template>
