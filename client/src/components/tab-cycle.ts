// Org-mode-flavored Tab cycle.
//
// Pressing Tab on the same node repeatedly walks through four positions
// relative to where the cycle began:
//
//   step 0 → indent (become child of previous sibling)
//   step 1 → back to origin
//   step 2 → top level (root of the current lane)
//   step 3 → at parent's level (= sibling of origin's parent)
//   loop  → step 0 again
//
// Any non-Tab user input on the row resets the cycle, so a fresh Tab
// starts at step 0 again. Switching to a different node also resets
// (because each row only tracks its own state).

export type CycleOrigin = {
  parentId: string | null;
  laneId: string | null;
  rootLaneId: string;
  parentParentId: string | null; // grandparent for the "parent's level" step
  nextSiblingId: string | null; // sibling that was just after origin, for "back to origin"
};

export type CycleState = {
  step: number; // next step to apply on this press
  origin: CycleOrigin;
};

const states = new Map<string, CycleState>();

export function getCycle(nodeId: string): CycleState | undefined {
  return states.get(nodeId);
}

export function startCycle(nodeId: string, origin: CycleOrigin): CycleState {
  const state: CycleState = { step: 0, origin };
  states.set(nodeId, state);
  return state;
}

export function advanceCycle(nodeId: string) {
  const s = states.get(nodeId);
  if (s) s.step = (s.step + 1) % 4;
}

export function resetCycle(nodeId: string) {
  states.delete(nodeId);
}
