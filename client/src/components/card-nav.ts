// Card-to-card keyboard navigation.
//
// Each NodeRow renders a card div with [data-card-node-id] and lives inside
// a section[data-lane-id]. Each lane also has a button[data-role="add-node"]
// at the end which we treat as the last navigable item in the lane — so
// ArrowDown from the bottom card lands on +add, and ArrowUp from +add goes
// back to the bottom card. Cards within a lane are listed in document
// order = display order (depth-first pre-order of the outline tree), so
// simple linear queries give us the ordering we want.

function cssEscape(s: string): string {
  // Node ids are uuids so this is conservative, but keep it general.
  return s.replace(/["\\]/g, "\\$&");
}

function findCard(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-card-node-id="${cssEscape(nodeId)}"]`,
  );
}

function lanesInOrder(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("section[data-lane-id]"),
  );
}

const TARGET_SELECTOR = "[data-card-node-id], [data-role='add-node']";

function targetsInLane(section: HTMLElement): HTMLElement[] {
  return Array.from(section.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
}

function firstTargetIn(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>(TARGET_SELECTOR);
}

export function focusCard(nodeId: string) {
  findCard(nodeId)?.focus();
}

export function navigateFrom(
  current: HTMLElement,
  direction: "up" | "down" | "left" | "right",
): boolean {
  const section = current.closest<HTMLElement>("section[data-lane-id]");
  if (!section) return false;

  if (direction === "up" || direction === "down") {
    const list = targetsInLane(section);
    const idx = list.findIndex((el) => el === current);
    if (idx < 0) return false;
    const target = direction === "up" ? list[idx - 1] : list[idx + 1];
    if (!target) return false;
    target.focus();
    return true;
  }

  // left / right: jump to the nearest navigable item in the adjacent lane.
  const lanes = lanesInOrder();
  const laneIdx = lanes.findIndex((s) => s === section);
  if (laneIdx < 0) return false;
  const step = direction === "left" ? -1 : 1;
  let i = laneIdx + step;
  while (i >= 0 && i < lanes.length) {
    const target = firstTargetIn(lanes[i]!);
    if (target) {
      target.focus();
      return true;
    }
    i += step;
  }
  return false;
}

export function navigateCard(
  nodeId: string,
  _laneId: string,
  direction: "up" | "down" | "left" | "right",
): boolean {
  const card = findCard(nodeId);
  if (!card) return false;
  return navigateFrom(card, direction);
}
