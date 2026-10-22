import { z } from "zod";

/**
 * The carousel studio's page state (screens.md B4). It lives in the page only: there is no carousel storage yet, so a
 * browser draft (localStorage, versioned) is the most it keeps.
 */

export const TEMPLATES = ["ink", "paper", "gradient", "band", "mixed"] as const;
export type TemplateId = (typeof TEMPLATES)[number];
export const ASPECTS = ["4:5", "1:1"] as const;
export type Aspect = (typeof ASPECTS)[number];
export type Kit = "orbit" | "personal";

/** LinkedIn documents allow far more, but a carousel past 12 slides loses readers; the generator caps at 10. */
export const MAX_SLIDES = 20;
export const TITLE_MAX = 140;
export const BODY_MAX = 320;

export type Slide = { id: string; title: string; body: string };
export type CarouselState = {
  slides: Slide[];
  activeId: string | null;
  template: TemplateId;
  aspect: Aspect;
  kit: Kit;
  logo: boolean;
};

type Options = Pick<CarouselState, "template" | "aspect" | "kit" | "logo">;

export type CarouselAction =
  | { type: "add"; id: string; slide?: Omit<Slide, "id"> }
  | { type: "duplicate"; id: string; newId: string }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; by: number }
  | { type: "moveTo"; id: string; index: number }
  | { type: "select"; id: string }
  | { type: "edit"; id: string; patch: Partial<Omit<Slide, "id">> }
  | { type: "replace"; slides: Slide[] }
  | { type: "set"; patch: Partial<Options> }
  | { type: "load"; state: CarouselState };

export function initialCarousel(): CarouselState {
  return { slides: [], activeId: null, template: "ink", aspect: "4:5", kit: "orbit", logo: true };
}

const indexOf = (s: CarouselState, id: string | null) => (id === null ? -1 : s.slides.findIndex((x) => x.id === id));

function moveTo(s: CarouselState, id: string, target: number): CarouselState {
  const from = indexOf(s, id);
  if (from < 0) return s;
  const to = Math.max(0, Math.min(s.slides.length - 1, target));
  if (to === from) return s;
  const slides = [...s.slides];
  const [slide] = slides.splice(from, 1);
  slides.splice(to, 0, slide!);
  return { ...s, slides };
}

export function carouselReducer(s: CarouselState, a: CarouselAction): CarouselState {
  switch (a.type) {
    case "add": {
      if (s.slides.length >= MAX_SLIDES) return s;
      const at = indexOf(s, s.activeId);
      const slides = [...s.slides];
      slides.splice(at < 0 ? slides.length : at + 1, 0, { id: a.id, title: a.slide?.title ?? "", body: a.slide?.body ?? "" });
      return { ...s, slides, activeId: a.id };
    }
    case "duplicate": {
      const at = indexOf(s, a.id);
      if (at < 0 || s.slides.length >= MAX_SLIDES) return s;
      const slides = [...s.slides];
      slides.splice(at + 1, 0, { ...s.slides[at]!, id: a.newId });
      return { ...s, slides, activeId: a.newId };
    }
    case "delete": {
      const at = indexOf(s, a.id);
      if (at < 0) return s;
      const slides = s.slides.filter((x) => x.id !== a.id);
      const activeId = s.activeId === a.id ? (slides[Math.min(at, slides.length - 1)]?.id ?? null) : s.activeId;
      return { ...s, slides, activeId };
    }
    case "move":
      return moveTo(s, a.id, indexOf(s, a.id) + a.by);
    case "moveTo":
      return moveTo(s, a.id, a.index);
    case "select":
      return indexOf(s, a.id) < 0 || s.activeId === a.id ? s : { ...s, activeId: a.id };
    case "edit":
      return { ...s, slides: s.slides.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case "replace":
      return { ...s, slides: a.slides.slice(0, MAX_SLIDES), activeId: a.slides[0]?.id ?? null };
    case "set":
      return { ...s, ...a.patch };
    case "load":
      return a.state;
  }
}

// --- Browser draft --------------------------------------------------------------------------------------------------

export const DRAFT_KEY = "orbit-carousel-draft";
const DRAFT_VERSION = 1;

const DraftSchema = z.object({
  v: z.literal(DRAFT_VERSION),
  state: z.object({
    slides: z
      .array(z.object({ id: z.string().min(1).max(64), title: z.string().max(TITLE_MAX * 2), body: z.string().max(BODY_MAX * 2) }))
      .max(MAX_SLIDES),
    activeId: z.string().nullable(),
    template: z.enum(TEMPLATES),
    aspect: z.enum(ASPECTS),
    kit: z.enum(["orbit", "personal"]),
    logo: z.boolean(),
  }),
});

export function serializeDraft(s: CarouselState): string {
  return JSON.stringify({ v: DRAFT_VERSION, state: s });
}

/** A stored draft, or null when it's missing, from another version, or damaged. */
export function parseDraft(raw: string | null): CarouselState | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) return null;
  const state = parsed.data.state;
  const activeId = state.slides.some((x) => x.id === state.activeId) ? state.activeId : (state.slides[0]?.id ?? null);
  return { ...state, activeId };
}
