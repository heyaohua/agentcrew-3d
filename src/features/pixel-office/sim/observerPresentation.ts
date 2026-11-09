import type { PixelAgentInput, PixelAgentPose } from "../types";

/** Real state determines power; reaching the chair enables working effects. */
export function observerScreenState(input: PixelAgentInput, pose?: PixelAgentPose): "off" | "working" | "unknown" {
  if (input.observation?.uncertain) return "unknown";
  if (input.observation?.state !== "working") return "off";
  return pose?.activity === "sitting_desk" ? "working" : "off";
}
