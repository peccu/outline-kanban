import { VueRenderer } from "@tiptap/vue-3";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
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
      let lastProps: SuggestionProps<Tag> | null = null;
      let selected = 0;

      function totalChoices() {
        if (!lastProps) return 0;
        return lastProps.items.length + (lastProps.query ? 1 : 0);
      }

      function buildProps(p: SuggestionProps<Tag>) {
        return {
          items: p.items,
          query: p.query,
          selected,
          command: (item: { id: string | null; label: string }) => {
            p.command({
              id: item.id ?? item.label,
              label: item.label,
            } as any);
          },
        };
      }

      function pick(i: number) {
        if (!lastProps) return;
        if (i < lastProps.items.length) {
          const t = lastProps.items[i]!;
          lastProps.command({ id: t.id, label: t.name } as any);
        } else if (lastProps.query) {
          lastProps.command({
            id: lastProps.query,
            label: lastProps.query,
          } as any);
        }
      }

      return {
        onStart: (props) => {
          lastProps = props;
          selected = 0;
          component = new VueRenderer(MentionList, {
            props: buildProps(props),
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
          if (lastProps?.query !== props.query) selected = 0;
          lastProps = props;
          component?.updateProps(buildProps(props));
          if (props.clientRect) {
            popup?.setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            });
          }
        },

        onKeyDown({ event }) {
          if (event.key === "Escape") {
            popup?.hide();
            return true;
          }
          const total = totalChoices();
          if (total === 0) return false;

          if (event.key === "ArrowDown") {
            selected = (selected + 1) % total;
            if (lastProps) component?.updateProps(buildProps(lastProps));
            return true;
          }
          if (event.key === "ArrowUp") {
            selected = (selected - 1 + total) % total;
            if (lastProps) component?.updateProps(buildProps(lastProps));
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            pick(selected);
            return true;
          }
          return false;
        },

        onExit() {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
          lastProps = null;
        },
      };
    },
  };
}
