import type { WindowLayout } from "../common/drawer";
import type { Placement } from "./native";
export function placements(
  ids: string[],
  mode: WindowLayout,
  active: string | null,
  rect: { x: number; y: number; width: number; height: number },
): Placement[] {
  const visible = mode === "single" ? ids.filter((id) => id === active) : ids;
  const columns =
    mode === "matrix" ? Math.ceil(Math.sqrt(visible.length)) : visible.length;
  const rows = mode === "matrix" ? Math.ceil(visible.length / columns) : 1;
  if (!columns || rect.width < 1 || rect.height < 1) return [];
  return visible.map((routeId, i) => ({
    routeId,
    bounds: {
      x: rect.x + ((i % columns) * rect.width) / columns,
      y: rect.y + (Math.floor(i / columns) * rect.height) / rows,
      width: rect.width / columns,
      height: rect.height / rows,
    },
  }));
}
