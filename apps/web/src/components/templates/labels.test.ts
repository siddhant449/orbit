import { describe, expect, it } from "vitest";
import { splitSlots, usedLabel } from "./labels";

describe("template labels", () => {
  it("marks [slots] in the preview and keeps the rest", () => {
    expect(splitSlots("I [did X]. Then [Y]\n[Z]")).toEqual([
      { text: "I ", slot: false },
      { text: "[did X]", slot: true },
      { text: ". Then ", slot: false },
      { text: "[Y]", slot: true },
      { text: "\n", slot: false },
      { text: "[Z]", slot: true },
    ]);
    expect(splitSlots("no slots")).toEqual([{ text: "no slots", slot: false }]);
  });

  it("says 'Used 1 time' and 'Used N times'", () => {
    expect([usedLabel(0), usedLabel(1), usedLabel(2)]).toEqual(["Used 0 times", "Used 1 time", "Used 2 times"]);
  });
});
