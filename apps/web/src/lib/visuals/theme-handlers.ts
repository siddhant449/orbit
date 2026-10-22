import {
  BrandThemeError, getObject, getTheme, resetTheme, saveTheme, setDecision, setLogo, softDeleteObject, THEME_ROLES, type Theme,
} from "@brandloop/db";
import { extractTheme } from "@brandloop/visuals";
import sharp from "sharp";
import { z } from "zod";
import { storeFile } from "@/lib/storage";
import { currentProfile, fail } from "./handlers";
import { isResponse, readImageUpload } from "./uploads";

/** Brand theme routes (design F5 §5): eight colours, the keep/skip decision, extraction from an image, and the logo. */

const Colours = z.object(Object.fromEntries(THEME_ROLES.map((r) => [r, z.string()])) as Record<(typeof THEME_ROLES)[number], z.ZodString>);

async function themeJson(profileId: string, theme?: Theme) {
  const t = theme ?? (await getTheme(profileId));
  const logo = t.logoObjectId ? await getObject(profileId, t.logoObjectId) : null;
  return {
    theme: Object.fromEntries(THEME_ROLES.map((r) => [r, t[r]])),
    decision: t.decision,
    source: t.source,
    logoUrl: logo?.url ?? null,
  };
}

const themeError = (err: unknown) => {
  if (err instanceof BrandThemeError) return fail(400, err.message);
  throw err;
};

export async function getThemeHandler(): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  return Response.json(await themeJson(profile.id));
}

/** PUT /api/brand-theme: the eight colours (`#RRGGBB`); saving confirms the theme. */
export async function putThemeHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const body = z.object({ theme: Colours, source: z.enum(["manual", "image"]).default("manual") }).safeParse(await request.json().catch(() => undefined));
  if (!body.success) return fail(400, "Send all eight colours.");
  try {
    return Response.json(await themeJson(profile.id, await saveTheme(profile.id, body.data.theme, body.data.source)));
  } catch (err) {
    return themeError(err);
  }
}

/** DELETE /api/brand-theme: back to the default palette (the logo file is released). */
export async function deleteThemeHandler(): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const before = await getTheme(profile.id);
  await resetTheme(profile.id);
  if (before.logoObjectId) await softDeleteObject(profile.id, before.logoObjectId);
  return Response.json(await themeJson(profile.id));
}

/** POST /api/brand-theme/decision {accept, proposal?}: accept saves the proposal as confirmed, skip records SKIPPED. */
export async function decisionHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const body = z.object({ accept: z.boolean(), proposal: Colours.optional() }).safeParse(await request.json().catch(() => undefined));
  if (!body.success) return fail(400, "Say whether to use these colours.");
  try {
    return Response.json(await themeJson(profile.id, await setDecision(profile.id, body.data.accept, body.data.proposal)));
  } catch (err) {
    return themeError(err);
  }
}

/** POST /api/brand-theme/extract (multipart image): a proposed theme from the image. Nothing is saved or charged. */
export async function extractHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const upload = await readImageUpload(request, {
    maxBytes: 8 * 1024 * 1024,
    allowed: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    label: "Images",
  });
  if (isResponse(upload)) return upload;
  try {
    return Response.json({ theme: await extractTheme(upload.bytes) });
  } catch {
    return fail(415, "That file doesn't match its type.");
  }
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** A logo is trimmed of empty margins and capped at 1,024 px on the longest side, stored as PNG. */
async function prepareLogo(bytes: Buffer): Promise<{ bytes: Buffer }> {
  const base = () => sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().ensureAlpha();
  let trimmed: Buffer;
  try {
    trimmed = await base().trim().toBuffer();
  } catch {
    trimmed = await base().png().toBuffer(); // a flat image can't be trimmed
  }
  return { bytes: await sharp(trimmed).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer() };
}

/** POST /api/brand-theme/logo (multipart PNG/JPG/WebP ≤ 2 MB): public store, kind LOGO. SVG is refused. */
export async function postLogoHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const upload = await readImageUpload(request, { maxBytes: LOGO_MAX_BYTES, allowed: ["image/png", "image/jpeg", "image/webp"], label: "Logos" });
  if (isResponse(upload)) return upload;
  let logo;
  try {
    logo = await prepareLogo(upload.bytes);
  } catch {
    return fail(415, "That file doesn't match its type.");
  }
  const before = await getTheme(profile.id);
  const stored = await storeFile(profile.id, profile.teamId, "LOGO", logo.bytes, "image/png");
  const theme = await setLogo(profile.id, stored.id);
  if (before.logoObjectId) await softDeleteObject(profile.id, before.logoObjectId);
  return Response.json(await themeJson(profile.id, theme), { status: 201 });
}

export async function deleteLogoHandler(): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const before = await getTheme(profile.id);
  if (!before.logoObjectId) return Response.json(await themeJson(profile.id, before));
  const theme = await setLogo(profile.id, null);
  await softDeleteObject(profile.id, before.logoObjectId);
  return Response.json(await themeJson(profile.id, theme));
}
