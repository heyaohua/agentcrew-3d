import { OBJECT_FOOTPRINT, PIXEL_TILE_SIZE, type PixelAgentPose, type PixelOfficeMap } from "../types";

/** Shared sofa sprites overlap their seat rows, especially joined vertical
 * modules. Occupants need a separate layer above the whole sofa group instead
 * of the ordinary feet-Y sort; position-based detection also covers stale
 * actors whose animation has changed from seated to standing. */
export function createObserverAgentDepth(map: PixelOfficeMap, observationMode: boolean) {
  const baseDepth = (pose: PixelAgentPose) => pose.y + PIXEL_TILE_SIZE / 2;
  if (!observationMode) return baseDepth;
  const sofaTopDepth = Math.max(0, ...map.objects
    .filter(object => object.kind === "sofa_h" || object.kind === "sofa_v")
    .map(object => (object.ty + OBJECT_FOOTPRINT[object.kind][1]) * PIXEL_TILE_SIZE)) + 1;
  const seats = map.stations
    .filter(station => station.id.startsWith("rest-tea-") || station.id.startsWith("rest-game-"))
    .map(station => ({ x: (station.tx + 0.5) * PIXEL_TILE_SIZE, y: (station.ty + 0.5) * PIXEL_TILE_SIZE }));
  return (pose: PixelAgentPose) => {
    const onSofa = seats.some(seat => Math.abs(pose.x - seat.x) < PIXEL_TILE_SIZE * 0.75 && Math.abs(pose.y - seat.y) < PIXEL_TILE_SIZE * 0.75);
    return onSofa ? Math.max(baseDepth(pose), sofaTopDepth) + pose.y / (map.rows * PIXEL_TILE_SIZE + 1) : baseDepth(pose);
  };
}
