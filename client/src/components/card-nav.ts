// Card-to-card keyboard navigation.
//
// Each NodeRow renders a card div with [data-node-id] and lives inside a
// section[data-lane-id]. Cards within a lane are listed in document order
// = display order (depth-first pre-order of the outline tree), so simple
// nextElementSibling-style queries give us the ordering we want.

function findCard(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-card-node-id="${cssEscape(nodeId)}"]`,
  );
}

function cssEscape(s: string): string {
  // Node ids are uuids so this is conservative, but keep it general.
  return s.replace(/["\\]/g, "\\$&");
}

function lanesInOrder(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("section[data-lane-id]"),
  );
}

function cardsInLane(laneId: string): HTMLElement[] {
  const section = document.querySelector(
    `section[data-lane-id="${cssEscape(laneId)}"]`,
  );
  if (!section) return [];
  return Array.from(
    section.querySelectorAll<HTMLElement>("[data-card-node-id]"),
  );
}

export function focusCard(nodeId: string) {
  findCard(nodeId)?.focus();
}

export function navigateCard(
  nodeId: string,
  laneId: string,
  direction: "up" | "down" | "left" | "right",
): boolean {
  if (direction === "up" || direction === "down") {
    const list = cardsInLane(laneId);
    const idx = list.findIndex((el) => el.dataset.cardNodeId === nodeId);
    if (idx < 0) return false;
    const target = direction === "up" ? list[idx - 1] : list[idx + 1];
    if (!target) return false;
    target.focus();
    return true;
  }

  // left / right: jump to the nearest card in the adjacent lane.
  const lanes = lanesInOrder();
  const laneIdx = lanes.findIndex((s) => s.dataset.laneId === laneId);
  if (laneIdx < 0) return false;
  const step = direction === "left" ? -1 : 1;
  let i = laneIdx + step;
  while (i >= 0 && i < lanes.length) {
    const targetLane = lanes[i]!;
    const firstCard = targetLane.querySelector<HTMLElement>(
      "[data-card-node-id]",
    );
    if (firstCard) {
      firstCard.focus();
      return true;
    }
    i += step;
  }
  return false;
}
