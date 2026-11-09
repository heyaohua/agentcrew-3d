import type { PixelMapObject } from "../types";

/** Base art opens down (horizontal sofa) or right (vertical sofa).
 * Mirroring preserves the tile footprint/anchor used by seat navigation. */
export function observerFurnitureFlip(object: PixelMapObject, observationMode: boolean) {
  return {
    flipX: observationMode && object.kind === "sofa_v" && object.facing === "left",
    flipY: observationMode && object.kind === "sofa_h" && object.facing === "up",
  };
}
