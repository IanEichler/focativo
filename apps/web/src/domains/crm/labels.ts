import type { StatusTone } from "@/components/data/status-badge";

const TONES: readonly StatusTone[] = ["neutral", "success", "warning", "danger", "info", "brand"];

export function stageTone(color: string): StatusTone {
  return (TONES as readonly string[]).includes(color) ? (color as StatusTone) : "neutral";
}
