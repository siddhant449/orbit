import { describe, expect, it } from "vitest";
import { moveItem } from "./order";

describe("moveItem", () => {
  it("moves down, up and to the ends", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveItem(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(ids, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(ids, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(moveItem(ids, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveItem(ids, 9, 0)).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});
