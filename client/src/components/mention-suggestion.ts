import { VueRenderer } from "@tiptap/vue-3";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { SuggestionOptions } from "@tiptap/suggestion";
import MentionList from "./MentionList.vue";
import { api } from "@/api/client";
import type { Tag } from "@/api/client";

export function buildTagSuggestion(): Omit<
  SuggestionOptions<Tag>,
  "editor"
> {
  return {
    char: "#",
    allowSpaces: false,
    items: async ({ query }) => {
      const { data } = await api.GET("/api/tags");
      const all = data ?? [];
      const q = query.toLowerCase();
      return all
        .filter((t) => t.name.toLowerCase().includes(q))
        .slice(0, 8);
    },

    render: () => {
      let component: VueRenderer | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props) => {
          component = new VueRenderer(MentionList, {
            props: {
              items: props.items,
              query: props.query,
              command: (item: { id: string | null; label: string }) => {
                props.command({
                  id: item.id ?? item.label,
                  label: item.label,
                });
              },
            },
            editor: props.editor,
          });

          if (!props.clientRect || !component.element) return;
          popup = tippy(document.body as Element, {
            getReferenceClientRect: () =>
              props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            appendTo: () => document.body,
            content: component.element as Element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            theme: "outline-kanban",
          });
        },

        onUpdate(props) {
          component?.updateProps({
            items: props.items,
            query: props.query,
            command: (item: { id: string | null; label: string }) => {
              props.command({
                id: item.id ?? item.label,
                label: item.label,
              });
            },
          });
          (component?.ref as any)?.setQuery?.(props.query);
          if (props.clientRect) {
            popup?.setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            });
          }
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown?.(props.event) ?? false;
        },

        onExit() {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}
