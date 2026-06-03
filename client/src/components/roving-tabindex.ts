import { onBeforeUnmount, onMounted, type Ref } from "vue";

// Roving-tabindex for a cluster of buttons: the whole group is a single Tab
// stop, and Left/Right (optionally Up/Down) move focus between items, which are
// activated with Enter/Space (native button behaviour). Mark each focusable
// child with `data-roving-item`. Wire the returned handlers on the container:
//   <div ref="group" @keydown="roving.onKeydown" @focusin="roving.onFocusin">
export function useRovingTabindex(
  container: Ref<HTMLElement | null>,
  opts: { orientation?: "horizontal" | "both" } = {},
) {
  function items(): HTMLElement[] {
    const c = container.value;
    if (!c) return [];
    return Array.from(
      c.querySelectorAll<HTMLElement>("[data-roving-item]"),
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
  }

  function refresh(active?: HTMLElement | null) {
    const list = items();
    if (list.length === 0) return;
    const current =
      active && list.includes(active)
        ? active
        : list.find((el) => el.tabIndex === 0) ?? list[0]!;
    for (const el of list) el.tabIndex = el === current ? 0 : -1;
  }

  function onFocusin(e: FocusEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.hasAttribute("data-roving-item")) refresh(t);
  }

  function onKeydown(e: KeyboardEvent) {
    const horizontal = e.key === "ArrowRight" || e.key === "ArrowLeft";
    const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
    if (!horizontal && !(opts.orientation === "both" && vertical)) return;
    const list = items();
    if (list.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    let idx = active ? list.indexOf(active) : -1;
    if (idx < 0) idx = 0;
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const next = (idx + (forward ? 1 : -1) + list.length) % list.length;
    e.preventDefault();
    const target = list[next]!;
    target.focus();
    refresh(target);
  }

  // Items can appear/disappear (lanes load async, tag suggestions filter as you
  // type); keep exactly one of them tabbable.
  let mo: MutationObserver | null = null;
  onMounted(() => {
    refresh();
    const c = container.value;
    if (c) {
      mo = new MutationObserver(() => refresh());
      mo.observe(c, { childList: true, subtree: true });
    }
  });
  onBeforeUnmount(() => mo?.disconnect());

  return { onFocusin, onKeydown };
}
