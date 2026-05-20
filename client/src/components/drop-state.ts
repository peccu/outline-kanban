// Cross-component state for an in-flight drag-and-drop operation.
// Holds the resolved insertion target so NodeRow / OutlinePanel can render
// a precise drop indicator while the user is dragging, and KanbanBoard
// can read the same target when the drop actually fires.
import { computed, ref } from "vue";

export type DropTarget = {
  laneId: string;
  // The id of the root-level card the dragged card will land *above*.
  // `null` means "drop at the end of the lane".
  beforeId: string | null;
};

const target = ref<DropTarget | null>(null);

export function setDropTarget(t: DropTarget | null) {
  target.value = t;
}

export function clearDropTarget() {
  target.value = null;
}

export function getDropTarget(): DropTarget | null {
  return target.value;
}

export const dropTargetRef = computed(() => target.value);

export function isDropBefore(nodeId: string): boolean {
  const t = target.value;
  return t !== null && t.beforeId === nodeId;
}

export function isDropAtEndOf(laneId: string): boolean {
  const t = target.value;
  return t !== null && t.laneId === laneId && t.beforeId === null;
}

// Separate channel for lane-level drag/drop. `beforeLaneId === null`
// means "drop at the right end of the board".
export type LaneDropTarget = { beforeLaneId: string | null };

const laneTarget = ref<LaneDropTarget | null>(null);

export function setLaneDropTarget(t: LaneDropTarget | null) {
  laneTarget.value = t;
}
export function clearLaneDropTarget() {
  laneTarget.value = null;
}
export function getLaneDropTarget(): LaneDropTarget | null {
  return laneTarget.value;
}
export function isLaneDropBefore(laneId: string): boolean {
  const t = laneTarget.value;
  return t !== null && t.beforeLaneId === laneId;
}
export function isLaneDropAtEnd(): boolean {
  const t = laneTarget.value;
  return t !== null && t.beforeLaneId === null;
}
