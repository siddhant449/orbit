import type { StyleProfile } from "@brandloop/ai";

/** The measured layout in one line: "Hooks ~48 characters · 7–10 blocks · lists in 40% of posts". */
export function layoutLine(layout: StyleProfile["layout"]): string {
  const lists = Math.round(layout.listPosts.bullet + layout.listPosts.numbered);
  return [
    `Hooks ~${Math.round(layout.hookChars.typical)} characters`,
    `${Math.round(layout.blocks.low)}–${Math.round(layout.blocks.high)} blocks`,
    lists > 0 ? `lists in ${Math.min(100, lists)}% of posts` : "no lists",
  ].join(" · ");
}

export type StyleSummary = {
  id: string;
  name: string;
  tagline: string;
  own: boolean;
  status: "PENDING" | "ANALYZING" | "READY" | "FAILED";
  statusDetail: string | null;
  analyzedPostCount: number;
  profile: null | {
    voiceTarget: string;
    layoutLine: string;
    referencePost: { text: string; note: string };
    postCount: number;
  };
};

/** The reference post closest to the style's typical length: the one that shows its layout best. */
export function pickReferencePost(profile: StyleProfile): { text: string; note: string } {
  const target = profile.layout.postChars.typical;
  const best = [...profile.referencePosts].sort((a, b) => Math.abs(a.text.length - target) - Math.abs(b.text.length - target))[0]!;
  return { text: best.text, note: best.note };
}
