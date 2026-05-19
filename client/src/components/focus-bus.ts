// Cross-component focus bus.
//
// A NodeRow registers a focus function while it's mounted. Code elsewhere
// (mutation onSuccess, etc.) calls focusNode(id) to ask "whichever row is
// currently rendering this node id, focus your editor". The challenge is
// that indent / outdent / move all invalidate the nodes queries, which
// triggers a refetch -> re-render where the OLD NodeRow for that id
// unmounts and a NEW one mounts under a different parent. We can't tell
// in advance which instance will be live when we want to focus, so:
//
// - focusNode sets `pending` and retries several times over ~half a
//   second to cover the reactivity + network round-trip window.
// - registerFocusable, when it sees a pending request for its own id,
//   focuses on the next microtask (so the new mount wins over the old).
// - We do NOT clear `pending` synchronously inside attemptFocus, because
//   the first call typically focuses the OLD instance right before it
//   unmounts. Subsequent retries land on the new instance and re-focus.

const registry = new Map<string, () => void>();
let pending: string | null = null;

function attemptFocus() {
  if (!pending) return;
  const fn = registry.get(pending);
  if (fn) fn();
}

export function focusNode(id: string) {
  pending = id;
  for (const delay of [0, 16, 50, 150, 300]) {
    setTimeout(attemptFocus, delay);
  }
  setTimeout(() => {
    if (pending === id) pending = null;
  }, 500);
}

export function registerFocusable(id: string, focusFn: () => void) {
  registry.set(id, focusFn);
  if (pending === id) {
    queueMicrotask(focusFn);
    setTimeout(focusFn, 0);
  }
  return () => {
    if (registry.get(id) === focusFn) registry.delete(id);
  };
}
