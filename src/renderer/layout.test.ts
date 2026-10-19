import { describe, expect, it } from "vitest";
import { placements } from "./layout";
const rect = { x: 100, y: 32, width: 901, height: 603 };
describe("logical workspace geometry", () => {
  it("positions the active single route and handles empty/hidden workspaces", () => {
    expect(placements(["a", "b"], "single", "b", rect)).toEqual([
      { routeId: "b", bounds: rect },
    ]);
    expect(placements([], "matrix", null, rect)).toEqual([]);
    expect(placements(["a"], "single", null, rect)).toEqual([]);
    expect(placements(["a"], "spread", null, { ...rect, width: 0 })).toEqual(
      [],
    );
    expect(placements(["a"], "spread", null, { ...rect, height: 0 })).toEqual(
      [],
    );
  });
  it("tiles spread and matrix without rounding gaps at fractional DPI sizes", () => {
    const spread = placements(["a", "b", "c"], "spread", null, rect);
    expect(spread[2].bounds.x + spread[2].bounds.width).toBeCloseTo(1001);
    expect(spread.every((p) => p.bounds.height === 603)).toBe(true);
    const matrix = placements(["a", "b", "c"], "matrix", null, rect);
    expect(matrix[2].bounds.y).toBe(333.5);
    expect(matrix[0].bounds.width).toBe(450.5);
  });
});
