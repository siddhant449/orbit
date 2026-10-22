import { describe, expect, it } from "vitest";
import { carouselHeading, plainText } from "./view";

describe("plainText", () => {
  it("drops accent stars", () => {
    expect(plainText("Cost us *more* than *that*")).toBe("Cost us more than that");
  });
});

describe("carouselHeading", () => {
  it("names the source post and counts slides in words", () => {
    expect(carouselHeading("Why we killed the free tier", 6)).toBe("Why we killed the free tier, in six slides");
    expect(carouselHeading("Short", 1)).toBe("Short, in one slide");
    expect(carouselHeading("Many", 14)).toBe("Many, in 14 slides");
  });

  it("falls back when there's nothing to name", () => {
    expect(carouselHeading("", 0)).toBe("New carousel");
    expect(carouselHeading("  ", 3)).toBe("A carousel in three slides");
  });

  it("trims a trailing full stop and very long names", () => {
    expect(carouselHeading("Ship it.", 2)).toBe("Ship it, in two slides");
    expect(carouselHeading("x".repeat(90), 2).length).toBeLessThanOrEqual(80);
  });
});
