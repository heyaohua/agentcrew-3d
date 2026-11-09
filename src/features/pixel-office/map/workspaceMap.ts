import type { PixelMapObject, PixelOfficeMap, PixelStation } from "../types";

// The lounge is a fixed, authored communal room. Desk capacity must never
// generate another sofa/table pod, or assign a private rest seat to a desk.
const LOUNGE_OBJECTS: PixelMapObject[] = [
  { id: "pantry-counter-left", kind: "kitchen_counter", tx: 27, ty: 3 },
  { id: "pantry-counter-right", kind: "kitchen_counter", tx: 29, ty: 3 },
  { id: "pantry-tea", kind: "coffee_table", tx: 31, ty: 3 },
  { id: "pantry-coffee", kind: "coffee_machine", tx: 33, ty: 3 },
  { id: "pantry-water", kind: "water_cooler", tx: 36, ty: 3 },
  { id: "pantry-books", kind: "bookshelf", tx: 40, ty: 3 },
  // Joined sofa modules form one large L around the shared tea table.
  ...[26, 28, 30, 32, 34, 36, 38].map(tx => ({ id: `main-sofa-top-${tx}`, kind: "sofa_h" as const, facing: "down" as const, tx, ty: 10 })),
  ...[11, 13, 15, 17, 19].map(ty => ({ id: `main-sofa-side-${ty}`, kind: "sofa_v" as const, facing: "right" as const, tx: 26, ty })),
  { id: "shared-tea-table", kind: "meeting_table", tx: 32, ty: 15 },
  // A continuous window-side bench with a short return and a shared game table.
  ...[7, 9, 11, 13, 15, 17, 19, 21, 23, 25].map(ty => ({ id: `window-sofa-${ty}`, kind: "sofa_v" as const, facing: "left" as const, tx: 56, ty })),
  ...[48, 50, 52, 54].map(tx => ({ id: `window-sofa-return-${tx}`, kind: "sofa_h" as const, facing: "up" as const, tx, ty: 28 })),
  { id: "shared-game-table", kind: "meeting_table", tx: 48, ty: 18 },
  { id: "lounge-plant-entry", kind: "plant_tall", tx: 24, ty: 5 },
  { id: "lounge-plant-pantry", kind: "plant_tall", tx: 43, ty: 3 },
  { id: "lounge-plant-window", kind: "plant_tall", tx: 58, ty: 5 },
  { id: "lounge-plant-corner", kind: "plant", tx: 58, ty: 30 },
];
const LOUNGE_SEATS: PixelStation[] = [
  ...[27, 29, 31, 33, 35, 37].map((tx, index) => ({ id: `rest-tea-top-${index}`, kind: "coffee" as const, tx, ty: 10, facing: "down" as const })),
  ...[12, 14, 16, 18].map((ty, index) => ({ id: `rest-tea-side-${index}`, kind: "coffee" as const, tx: 26, ty, facing: "right" as const })),
  ...[8, 10, 12, 14, 16, 18, 20, 22, 24, 26].map((ty, index) => ({ id: `rest-game-window-${index}`, kind: "lounge_seat" as const, tx: 56, ty, facing: "left" as const })),
  ...[49, 51, 53, 55].map((tx, index) => ({ id: `rest-game-return-${index}`, kind: "lounge_seat" as const, tx, ty: 28, facing: "up" as const })),
];

/** Stable room coordinates preserve navigation and frozen actors on expansion. */
export function buildWorkspaceMap(capacity = 8): PixelOfficeMap {
  const slots = Math.max(8, Math.ceil(capacity / 4) * 4);
  const cols = 60, rows = Math.max(34, 5 + Math.ceil(slots / 4) * 6);
  const map: PixelOfficeMap = {
    cols, rows,
    ground: Array.from({ length: cols * rows }, (_, i) => {
      const x = i % cols, y = Math.floor(i / cols);
      if (x >= 23 && y > 32) return "void";
      if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1 || (x >= 23 && y === 32)) {
        return x === cols - 1 && y >= 7 && y <= 27 ? "wall_window" : "wall";
      }
      if (x >= 23) {
        if ((x >= 28 && x <= 41 && y >= 11 && y <= 23) || (x >= 45 && x <= 55 && y >= 14 && y <= 27)) return "carpet_purple";
        return "floor_cream";
      }
      return x >= 20 ? "floor_cream" : "floor_wood";
    }),
    objects: LOUNGE_OBJECTS.map(object => ({ ...object })), desks: [],
    stations: LOUNGE_SEATS.map(seat => ({ ...seat })),
    zones: [
      { id: "workspace", kind: "team_pod", label: "工作区 · 专注执行", tx: 1, ty: 1, tw: 19, th: rows - 2 },
      { id: "restspace", kind: "lounge", label: "共享休息区 · 喝茶 / 桌游", tx: 23, ty: 5, tw: 36, th: 26 },
      { id: "pantry", kind: "kitchen", label: "茶水间", tx: 26, ty: 0, tw: 16, th: 5 },
    ],
    spawn: { tx: 21, ty: 3 },
  };
  for (let index = 0; index < slots; index++) {
    const tx = 3 + index % 4 * 4;
    const ty = 5 + Math.floor(index / 4) * 6;
    map.objects.push(
      { id: `desk-${index}`, kind: "desk_monitor", tx, ty },
      { id: `chair-${index}`, kind: "chair", tx, ty: ty + 1, blocking: false },
    );
    map.desks.push({ id: `desk-${index}`, deskTx: tx, deskTy: ty, seatTx: tx, seatTy: ty + 1, facing: "up" });
    // Overflow is a labelled standing queue along the central aisle, not
    // duplicate seats or furniture. It expands with capacity outside the lounge.
    map.stations.push({ id: `rest-queue-${index}`, kind: "wander", tx: 20 + index % 2 * 2, ty: 4 + Math.floor(index / 2) * 2, facing: "right" });
  }
  return map;
}
