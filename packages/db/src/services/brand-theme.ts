import { prisma } from "../client";
import type { BrandDecision, BrandTheme } from "../generated/prisma/client";

export const THEME_ROLES = ["background", "accent", "headline", "bodyText", "caption", "line", "bar", "highlightBar"] as const;
export type ThemeRole = (typeof THEME_ROLES)[number];
export type ThemeColours = Record<ThemeRole, string>;

/** Orbit's own palette (paper ground, ink text, the cobalt accent), used until a team confirms its own. */
export const DEFAULT_THEME: ThemeColours = {
  background: "#F5F4F0",
  accent: "#4F5FF5",
  headline: "#0A0A0B",
  bodyText: "#3A3A3E",
  caption: "#5B5B5E",
  line: "#D8D7D2",
  bar: "#2A3BFF",
  highlightBar: "#C9CEFF",
};

export type Theme = ThemeColours & { decision: BrandDecision; source: string; logoObjectId: string | null };

export class BrandThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandThemeError";
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function validate(colours: ThemeColours): ThemeColours {
  const out = {} as ThemeColours;
  for (const role of THEME_ROLES) {
    const v = colours[role];
    if (typeof v !== "string" || !HEX.test(v)) throw new BrandThemeError(`${role} must be a colour like #RRGGBB`);
    out[role] = v.toUpperCase();
  }
  return out;
}

const toTheme = (row: BrandTheme): Theme => ({
  ...(Object.fromEntries(THEME_ROLES.map((r) => [r, row[r]])) as ThemeColours),
  decision: row.decision,
  source: row.source ?? "manual",
  logoObjectId: row.logoObjectId,
});

/** The profile's theme, or the Orbit default with decision NONE when none was saved. */
export async function getTheme(profileId: string): Promise<Theme> {
  const row = await prisma.brandTheme.findUnique({ where: { profileId } });
  return row ? toTheme(row) : { ...DEFAULT_THEME, decision: "NONE", source: "default", logoObjectId: null };
}

async function write(profileId: string, colours: ThemeColours, decision: BrandDecision, source: string): Promise<Theme> {
  const data = { ...validate(colours), decision, source };
  return toTheme(await prisma.brandTheme.upsert({ where: { profileId }, create: { profileId, ...data }, update: data }));
}

/** Validates all eight roles (`#RRGGBB`, stored upper case) and sets the decision to CONFIRMED. */
export function saveTheme(profileId: string, colours: ThemeColours, source: "manual" | "image"): Promise<Theme> {
  return write(profileId, colours, "CONFIRMED", source);
}

/** Accept saves the proposal (or the current colours) as CONFIRMED; skip records SKIPPED and keeps the colours. */
export async function setDecision(profileId: string, accept: boolean, proposal?: ThemeColours): Promise<Theme> {
  const current = await getTheme(profileId);
  if (accept) return write(profileId, proposal ?? current, "CONFIRMED", proposal ? "image" : current.source);
  return write(profileId, current, "SKIPPED", current.source);
}

/** Sets or clears the logo. The object must be this profile's live public LOGO. */
export async function setLogo(profileId: string, objectId: string | null): Promise<Theme> {
  if (objectId) {
    const obj = await prisma.storageObject.findFirst({ where: { id: objectId, profileId, kind: "LOGO", store: "PUBLIC", deletedAt: null } });
    if (!obj) throw new BrandThemeError("That logo isn't available");
  }
  const current = await getTheme(profileId);
  const data = { ...validate(current), decision: current.decision, source: current.source, logoObjectId: objectId };
  return toTheme(await prisma.brandTheme.upsert({ where: { profileId }, create: { profileId, ...data }, update: data }));
}

export async function resetTheme(profileId: string): Promise<void> {
  await prisma.brandTheme.deleteMany({ where: { profileId } });
}
