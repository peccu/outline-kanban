<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import TagPill from "./TagPill.vue";
import { useDeleteTag, useTags } from "@/api/queries";
import {
  clearTagFilter,
  isFiltering,
  isTagSelected,
  selectedTagCount,
  toggleTagFilter,
} from "./tag-filter";

const emit = defineEmits<{ close: [] }>();

const { data: tags, isPending } = useTags();
const del = useDeleteTag();

function removeTag(id: string, name: string) {
  if (!confirm(`Delete tag "#${name}"? It will be detached from all cards.`))
    return;
  del.mutate(id);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => document.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="emit('close')"
    >
      <div
        class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <header
          class="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3"
        >
          <h2 class="text-sm font-semibold tracking-tight text-neutral-100">
            tags
          </h2>
          <div class="flex items-center gap-2">
            <button
              v-if="isFiltering"
              type="button"
              class="rounded border border-emerald-700/60 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
              @click="clearTagFilter"
            >
              clear filter ({{ selectedTagCount }})
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
              aria-label="close"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div v-if="isPending" class="text-xs text-neutral-500">loading…</div>
          <ul v-else-if="tags && tags.length" class="flex flex-col gap-1.5">
            <li
              v-for="t in tags"
              :key="t.id"
              class="flex items-center justify-between gap-2 rounded border border-neutral-900 px-2 py-1.5 hover:border-neutral-800"
            >
              <TagPill :tag="t" editable />
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="rounded border px-2 py-0.5 text-[11px] transition-colors"
                  :class="
                    isTagSelected(t.id)
                      ? 'border-emerald-600 bg-emerald-500/15 text-emerald-300'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  "
                  :aria-pressed="isTagSelected(t.id)"
                  :aria-label="`filter by tag ${t.name}`"
                  @click="toggleTagFilter(t.id)"
                >
                  {{ isTagSelected(t.id) ? "filtering" : "filter" }}
                </button>
                <button
                  type="button"
                  class="rounded border border-neutral-800 px-2 py-0.5 text-[11px] text-rose-400 hover:bg-rose-500/10"
                  :aria-label="`delete tag ${t.name}`"
                  @click="removeTag(t.id, t.name)"
                >
                  delete
                </button>
              </div>
            </li>
          </ul>
          <div v-else class="text-xs text-neutral-600">no tags yet</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
