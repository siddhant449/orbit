/**
 * The style block the writer receives (design §2.4): the effective rules and the compiled style, in priority order,
 * stopped at a character budget. Parts 1-3 always go in; the rest only while they fit. A `dropped` rule is never here.
 */
import type { PostType, StyleProfile } from "@brandloop/ai/style";
import type { EffectiveRules, HardRules } from "./rules";

export const STYLE_BUDGET = 7_000;

const OVERRIDE_WORDS: Record<string, string> = {
  allowEmoji: "emoji",
  allowHashtags: "hashtags",
  allowDashes: "dashes",
  allowPostscript: "a P.S.",
  allowLinks: "links",
};

function hardLines(h: HardRules): string[] {
  const out: string[] = [];
  if (h.forbidEmoji) out.push("No emoji.");
  if (h.forbidDashes) out.push("No em dashes or en dashes; use commas or full stops.");
  if (h.forbidHashtags) out.push("No hashtags.");
  else out.push(`At most ${h.maxHashtags} hashtags, and only if the style uses them.`);
  if (h.forbidPostscript) out.push("No P.S. line.");
  if (h.maxBlockLines !== null) out.push(`No block longer than ${h.maxBlockLines} lines on a phone (about 50 characters per line).`);
  if (h.bannedPhrases.length) out.push(`Never use these words or phrases: ${h.bannedPhrases.join(", ")}.`);
  if (h.forbidRhetoricalOpening) out.push("Do not open with a question.");
  if (h.forbidLinks) out.push("No links in the post.");
  if (h.spelling) out.push(h.spelling === "en-GB" ? "Use British spelling." : "Use American spelling.");
  if (h.sourcesInPost) out.push("When research is used, end with a Sources line.");
  return out;
}

const range = (r: { low: number; high: number }) => `${Math.round(r.low)}-${Math.round(r.high)}`;

function layoutLines(r: EffectiveRules): string[] {
  const t = r.targets;
  const lists = Math.round(t.listPosts.bullet + t.listPosts.numbered);
  const out = [
    `Hook: ${t.hookMobileLines.high <= 1 ? "one mobile line" : "one or two mobile lines"}, ${range(t.hookChars)} characters, with the post's promise before the "see more" fold (about 210 characters).`,
    `Post: ${range(t.postChars)} characters in ${range(t.blocks)} blocks. Group 2-3 related lines in a block and start a new block only when the idea shifts. Never make every sentence its own block.`,
    lists >= 30
      ? `Lists: about ${lists}% of this style's posts use a list. When the point is parallel items, use a bullets or numbered block; list items sit on adjacent lines with no blank line between them.`
      : "Lists: use a list only when the point is parallel items; list items sit on adjacent lines.",
  ];
  if (t.emoji.perPost > 0) out.push(`Emoji: about ${t.emoji.perPost} per post.`);
  return out;
}

const section = (title: string, lines: string[]) => (lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join("\n")}` : "");

function referenceCandidates(profile: StyleProfile, postType: PostType | null) {
  return [...profile.referencePosts].sort((a, b) => Number(b.postType === postType) - Number(a.postType === postType) || a.text.length - b.text.length);
}

export function renderStyleBlock(
  profile: StyleProfile | null,
  rules: EffectiveRules,
  opts: { postType: PostType | null; budget: number; legacyGuide?: string },
): string {
  const overridden = Object.keys(rules.overrides).map((k) => OVERRIDE_WORDS[k]).filter(Boolean);
  const hard = section("Hard rules (the user's; they outrank everything else here):", [
    ...hardLines(rules.hard),
    ...(overridden.length ? [`This turn the user asked to allow: ${overridden.join(", ")}.`] : []),
  ]);
  const mandatory = [hard, section("Layout:", layoutLines(rules)), profile ? `Voice: ${profile.voiceTarget}` : ""].filter(Boolean);
  const parts: string[] = [...mandatory];
  const used = () => parts.join("\n\n").length;
  const add = (text: string) => {
    if (text && used() + 2 + text.length <= opts.budget) parts.push(text);
    return Boolean(text);
  };

  const user = rules.soft.filter((s) => s.source === "user").map((s) => s.text);
  add(section("The user's own preferences:", user));

  if (!profile) {
    const guide = (opts.legacyGuide ?? "").trim();
    if (guide) {
      const room = opts.budget - used() - 20;
      if (room > 100) parts.push(`Voice guide:\n${guide.length <= room ? guide : `${guide.slice(0, room).trimEnd()}…`}`);
    }
    return parts.join("\n\n");
  }

  const style = rules.soft.filter((s) => s.source === "style").map((s) => s.text);
  const byCategory = (labels: string[]) => style.filter((t) => labels.some((l) => t.startsWith(`${l},`)));
  add(section("Hooks, formatting and rhythm:", byCategory(["Hooks", "Formatting", "Rhythm"])));
  add(section("Signature moves (use the ones that fit):", style.filter((t) => t.includes("(use when")).slice(0, 4)));

  const refs = referenceCandidates(profile, opts.postType);
  const limit = opts.budget - used() > 2_400 ? 2 : 1;
  let taken = 0;
  for (const r of refs) {
    if (taken >= limit) break;
    if (add(`Example post by this style's owner (${r.postType}); match its layout, not its topic:\n<<<\n${r.text}\n>>>`)) taken++;
  }

  add(section("Word choice and closings:", byCategory(["Word choice", "Closings", "Overall"])));
  add(section("Before you answer, check:", profile.finalChecks));
  return parts.join("\n\n");
}
