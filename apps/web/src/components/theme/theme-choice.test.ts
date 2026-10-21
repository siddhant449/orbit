import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_CHOICES, THEME_STORAGE_KEY, themeChoice } from "./theme-choice";

describe("theme choice (system §3)", () => {
  it("dark is the default and the choice persists under orbit-theme", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(THEME_STORAGE_KEY).toBe("orbit-theme");
  });

  it("offers Light, Dark and Auto; each name contains its visible label", () => {
    expect(THEME_CHOICES.map((c) => [c.value, c.label, c.name])).toEqual([
      ["light", "Light", "Light theme"],
      ["dark", "Dark", "Dark theme"],
      ["system", "Auto", "Auto, system theme"],
    ]);
  });

  it("resolves the stored theme to a pressed choice; unknown or unhydrated falls back to dark", () => {
    expect(themeChoice("light")).toBe("light");
    expect(themeChoice("dark")).toBe("dark");
    expect(themeChoice("system")).toBe("system");
    expect(themeChoice(undefined)).toBe("dark");
    expect(themeChoice("sepia")).toBe("dark");
  });
});
