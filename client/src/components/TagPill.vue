<script setup lang="ts">
import { computed, ref } from "vue";
import { useUpdateTag } from "@/api/queries";
import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_PRESETS,
  tagPillStyle,
} from "@/lib/tag-color";
import type { Tag } from "@/api/client";

const props = withDefaults(
  defineProps<{
    tag: Pick<Tag, "id" | "name" | "color">;
    editable?: boolean;
  }>(),
  { editable: false },
);

const open = ref(false);
const update = useUpdateTag();
const style = computed(() => tagPillStyle(props.tag.color));
const activeColor = computed(() => props.tag.color || DEFAULT_TAG_COLOR);

function togglePicker(e: MouseEvent) {
  if (!props.editable) return;
  e.stopPropagation();
  open.value = !open.value;
}

function setColor(color: string | null) {
  update.mutate({ id: props.tag.id, patch: { color } });
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest('[data-role="tag-pill-root"]')) return;
  open.value = false;
}

import { onMounted, onBeforeUnmount, watch } from "vue";
watch(open, (v) => {
  if (v) document.addEventListener("click", onClickOutside, true);
  else document.removeEventListener("click", onClickOutside, true);
});
onMounted(() => {
  if (open.value) document.addEventListener("click", onClickOutside, true);
});
onBeforeUnmount(() =>
  document.removeEventListener("click", onClickOutside, true),
);
</script>

<template>
  <span
    data-role="tag-pill-root"
    class="relative inline-flex items-center"
  >
    <button
      v-if="editable"
      type="button"
      class="rounded border px-1.5 py-0 font-mono text-[10px] transition-opacity hover:opacity-80"
      :style="style"
      :title="`change color for #${tag.name}`"
      @click="togglePicker"
    >
      #{{ tag.name }}
    </button>
    <span
      v-else
      class="rounded border px-1.5 py-0 font-mono text-[10px]"
      :style="style"
    >
      #{{ tag.name }}
    </span>

    <div
      v-if="open && editable"
      class="absolute left-0 top-full z-30 mt-1 flex flex-wrap items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl"
    >
      <button
        v-for="preset in TAG_COLOR_PRESETS"
        :key="preset.value"
        type="button"
        class="size-4 rounded-full border transition-transform hover:scale-110"
        :style="{
          backgroundColor: preset.value,
          borderColor:
            activeColor.toLowerCase() === preset.value.toLowerCase()
              ? '#fafafa'
              : 'transparent',
        }"
        :title="preset.name"
        @click="setColor(preset.value)"
      />
      <button
        v-if="tag.color"
        type="button"
        class="ml-1 rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
        @click="setColor(null)"
        title="reset to default"
      >
        reset
      </button>
    </div>
  </span>
</template>
