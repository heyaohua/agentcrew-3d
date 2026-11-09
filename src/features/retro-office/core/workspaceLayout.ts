import type { FurnitureItem } from "./types";

export const WORKSPACE_WIDTH = 900;
export const WORKSPACE_HEIGHT = 650;
export const WORKSPACE_ROAM_POINTS = [
  { x: 100, y: 550 }, { x: 300, y: 550 },
  { x: 500, y: 550 }, { x: 700, y: 550 },
  { x: 850, y: 300 }, { x: 50, y: 300 },
];

/** A separate, deterministic layout for the read-only observer. */
export function buildWorkspaceFurniture(): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  for (let index = 0; index < 8; index++) {
    const x = 100 + (index % 4) * 200;
    const y = 180 + Math.floor(index / 4) * 240;
    const add = (type: FurnitureItem["type"], dx: number, dy: number, facing = 0) => {
      items.push({ type, x: x + dx, y: y + dy, facing,
        _uid: `observer-${index}-${type}`,
        ...(type === "desk_cubicle" ? { id: `desk_${index}` } : {}),
      });
    };
    add("desk_cubicle", 0, 0);
    add("chair", 20, -10, 180);
    add("computer", 20, -13);
    add("keyboard", 30, -5);
    add("mouse", 52, -5);
  }
  return items;
}
