import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { BrandThemeError, DEFAULT_THEME, getTheme, resetTheme, saveTheme, setDecision, setLogo } from "./brand-theme";
import { account, cleanupVisualTests, object, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const colours = { ...DEFAULT_THEME, accent: "#112233", background: "#FAFAFA" };

describe("brand theme", () => {
  it("defaults to the Orbit colours with decision NONE; saving sets CONFIRMED; bad hex is refused", async () => {
    const a = await account("t1");
    const def = await getTheme(a.profileId);
    expect(def).toMatchObject({ ...DEFAULT_THEME, decision: "NONE", source: "default", logoObjectId: null });
    expect(DEFAULT_THEME.accent).toBe("#4F5FF5");

    const saved = await saveTheme(a.profileId, colours, "manual");
    expect(saved).toMatchObject({ accent: "#112233", decision: "CONFIRMED", source: "manual" });
    expect((await getTheme(a.profileId)).accent).toBe("#112233");

    await expect(saveTheme(a.profileId, { ...colours, accent: "red" }, "manual")).rejects.toBeInstanceOf(BrandThemeError);
    await expect(saveTheme(a.profileId, { ...colours, bar: "#12345" }, "manual")).rejects.toThrow(/#RRGGBB/);
    await expect(saveTheme(a.profileId, { ...colours, bar: "#12345G" }, "manual")).rejects.toThrow();
    expect((await getTheme(a.profileId)).accent).toBe("#112233");
  });

  it("normalises hex to upper case", async () => {
    const a = await account("t2");
    expect((await saveTheme(a.profileId, { ...colours, accent: "#abcdef" }, "image")).accent).toBe("#ABCDEF");
  });

  it("decision: accept saves the proposal as CONFIRMED, skip sets SKIPPED and keeps colours", async () => {
    const a = await account("t3");
    expect(await setDecision(a.profileId, true, colours)).toMatchObject({ decision: "CONFIRMED", accent: "#112233" });
    const b = await account("t4");
    expect(await setDecision(b.profileId, false)).toMatchObject({ decision: "SKIPPED", accent: DEFAULT_THEME.accent });
    await expect(setDecision(b.profileId, true, { ...colours, accent: "nope" })).rejects.toBeInstanceOf(BrandThemeError);
  });

  it("is per profile", async () => {
    const a = await account("t5");
    const p2 = await secondProfile(a);
    await saveTheme(a.profileId, colours, "manual");
    expect((await getTheme(p2.profileId)).decision).toBe("NONE");
  });

  it("logo: only this profile's public LOGO object; null clears it; reset returns to the default", async () => {
    const a = await account("t6");
    const p2 = await secondProfile(a);
    const logo = await object(a, "LOGO");
    expect((await setLogo(a.profileId, logo.id)).logoObjectId).toBe(logo.id);
    await expect(setLogo(p2.profileId, logo.id)).rejects.toBeInstanceOf(BrandThemeError); // another profile's object
    const notLogo = await object(a, "VISUAL");
    await expect(setLogo(a.profileId, notLogo.id)).rejects.toBeInstanceOf(BrandThemeError);
    expect((await setLogo(a.profileId, null)).logoObjectId).toBeNull();
    await saveTheme(a.profileId, colours, "manual");
    await resetTheme(a.profileId);
    expect(await getTheme(a.profileId)).toMatchObject({ decision: "NONE", accent: DEFAULT_THEME.accent, logoObjectId: null });
  });
});
