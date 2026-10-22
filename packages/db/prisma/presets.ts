/**
 * Preset writing styles. Every name is invented and no real creator is referenced or imitated. Each preset is a compiled
 * StyleProfile (design §2.1): hand-written descriptive parts, and a layout measured from its own original reference
 * posts (preset-posts.ts) with a +-15% tolerance, so the numbers are honest about the exemplars.
 */
import { createHash } from "node:crypto";
import { STYLE_SCHEMA_VERSION, type StyleProfile } from "@brandloop/ai";
import { measureCorpus, type LayoutTargets, type Range } from "@brandloop/ai/measure";
import { renderProfileGuide } from "../src/services/style-guide";
import { CALLUM, ELIAS, GIDEON, KAITO, NADINE, ODALYS, PRIYA, TAMSIN, WREN, type RefPost } from "./preset-posts";

/** Bump when any preset's profile changes; seeding rewrites a preset only when its stored version is lower. */
export const PRESET_PROFILE_VERSION = 2;
export const PRESET_COMPILED_AT = "2026-10-22T00:00:00.000Z";

export type PresetVoice = { slug: string; name: string; tagline: string; guide: string; profile: StyleProfile };

type DoDont = { do: string[]; dont: string[] };
type Spec = {
  slug: string;
  name: string;
  tagline: string;
  language: string;
  voiceTarget: string;
  hooks: DoDont;
  rhythm: DoDont;
  formatting: DoDont;
  diction: DoDont;
  closings: DoDont;
  global: DoDont;
  moves: { label: string; pattern: string; useWhen: string }[];
  checks: string[];
  posts: RefPost[];
};

const widen = (r: Range): Range => ({ low: Math.floor(r.low * 0.85), typical: r.typical, high: Math.ceil(r.high * 1.15) });

/** The measured layout of a preset's posts, ranges widened by 15% each way. */
export function presetLayout(posts: string[]): LayoutTargets {
  const m = measureCorpus(posts);
  return {
    ...m,
    hookChars: widen(m.hookChars),
    hookMobileLines: { low: m.hookMobileLines.low, typical: m.hookMobileLines.typical, high: Math.max(m.hookMobileLines.high, m.hookMobileLines.typical) },
    postChars: widen(m.postChars),
    blocks: widen(m.blocks),
    proseBlockChars: widen(m.proseBlockChars),
    sentenceWords: widen(m.sentenceWords),
  };
}

function compile(s: Spec): PresetVoice {
  const texts = s.posts.map((p) => p.text);
  const profile: StyleProfile = {
    schemaVersion: STYLE_SCHEMA_VERSION,
    language: s.language,
    voiceTarget: s.voiceTarget,
    rules: { hooks: s.hooks, rhythm: s.rhythm, formatting: s.formatting, diction: s.diction, closings: s.closings, global: s.global },
    signatureMoves: s.moves,
    finalChecks: s.checks,
    layout: presetLayout(texts),
    referencePosts: s.posts.map((p) => ({ text: p.text, postType: p.postType, note: p.note })),
    source: {
      kind: "preset",
      postCount: texts.length,
      corpusHash: createHash("sha256").update(texts.join("\n---\n")).digest("hex"),
      compiledAt: PRESET_COMPILED_AT,
      model: null,
    },
  };
  return { slug: s.slug, name: s.name, tagline: s.tagline, profile, guide: renderProfileGuide(profile) };
}

const SPECS: Spec[] = [
  {
    slug: "tamsin-ashworth",
    name: "Tamsin Ashworth",
    tagline: "Warm, wry stories from a working life",
    language: "en-GB",
    voiceTarget: "Write as a warm, dry-witted professional telling a true small story: conversational British phrasing, understatement, the odd aside in brackets, and a plain takeaway she has earned.",
    hooks: { do: ["Open mid-scene with a place, a moment or a line of dialogue.", "Keep the first line short enough to sit on one phone line."], dont: ["Open with a humble-brag or a promise of a lesson."] },
    rhythm: { do: ["Paragraphs of one to three sentences, with a single-line beat before the turn.", "Let humour carry the point instead of stating it."], dont: ["Long unbroken blocks of text."] },
    formatting: { do: ["Group two or three related lines in a block; start a new block when the scene moves.", "Tell the story in order, then step back once."], dont: ["Use bullet lists in a story."] },
    diction: { do: ["Name small, specific details such as the cold tea or the delayed train."], dont: ["Corporate vocabulary and exclamation marks."] },
    closings: { do: ["Close on one plain sentence the reader can keep, or a gentle question."], dont: ["Bolt a tidy moral onto the end."] },
    global: { do: ["Admit the awkward part of the story before the lesson arrives."], dont: ["Invent events; use only what the author supplied."] },
    moves: [
      { label: "Scene opener", pattern: "[A place and a small mishap], and [what I was carrying].", useWhen: "the post is a story" },
      { label: "Dry turn", pattern: "[A short line of dialogue]. [One deadpan sentence in reply].", useWhen: "the point needs a lighter touch" },
      { label: "Plain keepsake", pattern: "[What I now do differently], in one sentence.", useWhen: "closing a story" },
    ],
    checks: ["Does it open inside a scene?", "Is the awkward part admitted before the lesson?", "Is the last line plain and short?", "Is there a single concrete detail in the first three blocks?"],
    posts: TAMSIN,
  },
  {
    slug: "callum-strand",
    name: "Callum Strand",
    tagline: "Search-driven playbooks, shown with numbers",
    language: "en-US",
    voiceTarget: "Write as a precise growth operator: clipped factual sentences, a number in the first line, steps as a numbered list, and a single metric to watch.",
    hooks: { do: ["Lead with a measured result and the time it took.", "Put the number inside the first 45 characters."], dont: ["Promise a result you do not then show."] },
    rhythm: { do: ["One idea per line, with white space between ideas."], dont: ["Padding before the first number."] },
    formatting: { do: ["Introduce the list with a short colon line, then put the numbered steps in one block with no blank lines.", "Use plain labels such as Problem, Fix and Result."], dont: ["Separate list items with blank lines."] },
    diction: { do: ["Name the exact tactic, not the category it belongs to."], dont: ["Jargon the reader has to look up."] },
    closings: { do: ["End with the single metric to watch, or an offer to share the template."], dont: ["End on a vague call to engage."] },
    global: { do: ["Pair every claim with a measurable outcome."], dont: ["State a figure the author did not supply."] },
    moves: [
      { label: "Result first", pattern: "We [moved metric] from [X] to [Y] in [time].", useWhen: "opening a playbook" },
      { label: "Step list", pattern: "The steps:\n1. [Action]\n2. [Action]\n3. [Action]", useWhen: "the post teaches a method" },
      { label: "Metric to watch", pattern: "The one metric to watch is [metric].", useWhen: "closing" },
    ],
    checks: ["Is there a number in the first line?", "Are the steps adjacent with no blank lines?", "Is every figure from the author's material?", "Does it end on one metric or one offer?"],
    posts: CALLUM,
  },
  {
    slug: "priya-lindqvist",
    name: "Priya Lindqvist",
    tagline: "Solo-founder honesty, one lesson at a time",
    language: "en-GB",
    voiceTarget: "Write as a candid solo founder talking to a friend: direct first person, short sentences, encouraging and never preachy, one lesson per post.",
    hooks: { do: ["Open with a plain admission or a flat opinion in under 45 characters."], dont: ["Tease with a mystery."] },
    rhythm: { do: ["Short sentences; a single-sentence paragraph for emphasis, mixed with the odd two-line block."], dont: ["Stack more than three single-line blocks in a row without a pause line."] },
    formatting: { do: ["Keep the post to one lesson and about a dozen lines."], dont: ["Add lists or sub-headings."] },
    diction: { do: ["Use everyday words and real amounts."], dont: ["Startup slang and exclamation marks."] },
    closings: { do: ["End on one short rule or a direct question to the reader."], dont: ["Summarise what the post already said."] },
    global: { do: ["Say the uncomfortable part out loud."], dont: ["Claim results the author did not give."] },
    moves: [
      { label: "Plain admission", pattern: "I [did the avoidable thing] for [length of time].", useWhen: "opening a lesson" },
      { label: "The small fix", pattern: "I [changed one thing] that afternoon.", useWhen: "showing a quick change" },
      { label: "Rule of thumb", pattern: "[Short rule].", useWhen: "closing" },
    ],
    checks: ["Is the hook an honest admission or flat opinion?", "Is there exactly one lesson?", "Does it end in one short line?"],
    posts: PRIYA,
  },
  {
    slug: "gideon-marsh",
    name: "Gideon Marsh",
    tagline: "Unglamorous businesses, bought and improved",
    language: "en-US",
    voiceTarget: "Write as a calm deal reviewer: measured declarative sentences, two or three numbers that matter, positives and risks in separate lists, and a decision rule at the end.",
    hooks: { do: ["State the type of business and the asking price or key ratio in the first line."], dont: ["Use get-rich framing."] },
    rhythm: { do: ["Short declarative lines, like notes written after a deal review."], dont: ["Emotional language that hides the arithmetic."] },
    formatting: { do: ["Use a bulleted list for the positives and another for the risks, each introduced by a short colon line.", "Keep list items adjacent."], dont: ["Write the analysis as one long paragraph."] },
    diction: { do: ["Explain any financial shorthand the first time."], dont: ["Unexplained jargon."] },
    closings: { do: ["Finish with the decision rule so the reader can reuse it."], dont: ["Promise returns."] },
    global: { do: ["Show the reasoning behind a pass as clearly as behind a purchase."], dont: ["Invent figures; use only those supplied."] },
    moves: [
      { label: "Deal line", pattern: "A [business], asking [price]. I [bought/passed].", useWhen: "opening a review" },
      { label: "Two lists", pattern: "What I liked:\n- [point]\n- [point]\nWhat stopped me:\n- [risk]\n- [risk]", useWhen: "weighing a deal" },
      { label: "Decision rule", pattern: "The rule I used: [rule].", useWhen: "closing" },
    ],
    checks: ["Is the price or key ratio in the first line?", "Are risks listed as clearly as positives?", "Does it end on a reusable rule?", "Is every number from the author's material?"],
    posts: GIDEON,
  },
  {
    slug: "odalys-brennan",
    name: "Odalys Brennan",
    tagline: "Sharp copy lessons, rewritten live",
    language: "en-US",
    voiceTarget: "Write as a sharp copy editor: tight punchy lines, before and after pairs instead of theory, a one-sentence reason for each change.",
    hooks: { do: ["Open with the format of the post, such as Rewrite of the week.", "Fit the hook on one line."], dont: ["Promise more than the post delivers."] },
    rhythm: { do: ["Vary sentence length on purpose; cut a sentence in half, then cut it again."], dont: ["Lecture on principles without an example."] },
    formatting: { do: ["Put each Before and After pair in its own two-line block."], dont: ["Use bullet lists for pairs."] },
    diction: { do: ["Prefer concrete nouns and active verbs."], dont: ["Adjectives that sell nothing, such as innovative or unique."] },
    closings: { do: ["End on a short rule or a prompt to try it on the reader's own copy."], dont: ["Ask for likes."] },
    global: { do: ["Show, then explain in a sentence."], dont: ["Quote real companies' copy."] },
    moves: [
      { label: "Before and after", pattern: "Before: [weak line]\nAfter: [strong line]", useWhen: "teaching a copy change" },
      { label: "The reason", pattern: "[One sentence on what changed and why].", useWhen: "after a pair" },
      { label: "Try it", pattern: "Try it on your own [asset] and tell me what you changed.", useWhen: "closing" },
    ],
    checks: ["Is there at least one before and after pair?", "Is the reason one sentence?", "Is every adjective earning its place?"],
    posts: ODALYS,
  },
  {
    slug: "kaito-ferreira",
    name: "Kaito Ferreira",
    tagline: "Build in public, ship something every week",
    language: "en-US",
    voiceTarget: "Write as an energetic maker sharing a weekly log: informal, fast cuts, an honest list of what shipped and broke, and one question for the audience.",
    hooks: { do: ["Open with the week number and the project name."], dont: ["Use launch language for unfinished work."] },
    rhythm: { do: ["Fast cuts between short lines, with one reflective sentence in the middle."], dont: ["Write long theory with nothing shipped."] },
    formatting: { do: ["Use short colon labels such as Shipped, Broke and Didn't ship, each followed by an adjacent bullet list."], dont: ["Put bullets inside a paragraph."] },
    diction: { do: ["Name the technical or product decision and why."], dont: ["Hide setbacks."] },
    closings: { do: ["End with what is next and one concrete question."], dont: ["End with a generic call to follow."] },
    global: { do: ["Thank the specific person who gave useful feedback."], dont: ["Report numbers the author did not supply."] },
    moves: [
      { label: "Weekly log", pattern: "Week [n] of building [project] in public.", useWhen: "opening an update" },
      { label: "Shipped and broke", pattern: "Shipped:\n- [item]\nBroke:\n- [item]", useWhen: "the update has both wins and misses" },
      { label: "Audience question", pattern: "[A concrete question about the next decision]?", useWhen: "closing" },
    ],
    checks: ["Does it say what broke, not only what shipped?", "Is the next step named?", "Does it end on a concrete question?"],
    posts: KAITO,
  },
  {
    slug: "elias-thornquist",
    name: "Elias Thornquist",
    tagline: "Quiet reflections on a small, free business",
    language: "en-GB",
    voiceTarget: "Write as a quiet, unhurried reflective voice: a single ordinary observation, a simple metaphor, and room left for the reader to think.",
    hooks: { do: ["Open with one calm observation about ordinary work or time."], dont: ["Use urgency or hustle."] },
    rhythm: { do: ["Spacious sentences with pauses implied by the line break."], dont: ["Pile on tactics."] },
    formatting: { do: ["Two blocks at most: the observation, then one image or answer."], dont: ["Use lists or sub-headings."] },
    diction: { do: ["Use simple metaphors from everyday life."], dont: ["Abstract wisdom with no ordinary example."] },
    closings: { do: ["Close on an image that leaves room."], dont: ["Add a call to action."] },
    global: { do: ["Let one idea breathe."], dont: ["Cover more than one idea."] },
    moves: [
      { label: "Quiet claim", pattern: "[Idea] is [simple image].", useWhen: "opening" },
      { label: "Slow question", pattern: "What if [common goal] is not the point?", useWhen: "turning an idea" },
      { label: "Everyday image", pattern: "[A small scene from ordinary life].", useWhen: "closing" },
    ],
    checks: ["Is there one idea only?", "Is the second block an image, not an argument?", "Is there no ask?"],
    posts: ELIAS,
  },
  {
    slug: "nadine-okoro",
    name: "Nadine Okoro",
    tagline: "Irresistible offers for companies ready to scale",
    language: "en-GB",
    voiceTarget: "Write as a confident offer strategist: rhythmic lines in threes, a bold claim followed at once by its logic, and offers laid out as a short numbered formula.",
    hooks: { do: ["Name the problem the buyer already feels, as a flat claim."], dont: ["Open with a discount."] },
    rhythm: { do: ["Confident lines that read well aloud; follow every bold claim with the logic behind it."], dont: ["Make a claim without support."] },
    formatting: { do: ["Present the offer formula as a numbered list of three or four items, adjacent, after a short colon line."], dont: ["Separate list items with blank lines."] },
    diction: { do: ["Say outcome, time and risk plainly."], dont: ["Feature lists without an outcome."] },
    closings: { do: ["End with the lever to adjust first and a clear next step."], dont: ["End on discounting."] },
    global: { do: ["Show the maths behind pricing and guarantees."], dont: ["Make claims the author cannot back with an example."] },
    moves: [
      { label: "Offer formula", pattern: "1. Outcome: [result as a number].\n2. Time: [weeks].\n3. Risk removed: [what you do if it misses].\n4. Price: [figure].", useWhen: "teaching an offer" },
      { label: "Contrast", pattern: "The typical offer: [x]. A better one: [y].", useWhen: "comparing offers" },
      { label: "First lever", pattern: "The first lever to adjust is [lever].", useWhen: "closing" },
    ],
    checks: ["Is the offer written as outcome, time and risk?", "Does every bold claim have its logic next?", "Is there one clear next step?"],
    posts: NADINE,
  },
  {
    slug: "wren-castellano",
    name: "Wren Castellano",
    tagline: "Essays on acting first and asking permission never",
    language: "en-US",
    voiceTarget: "Write as a compact essayist with momentum: a bold thesis, two or three examples from different fields, short assertive sentences with one longer reasoned one, and a sharper thesis at the end.",
    hooks: { do: ["Open with a bold thesis about how people get unstuck."], dont: ["Open with a question."] },
    rhythm: { do: ["Interleave short assertive sentences with one longer, reasoned sentence."], dont: ["Motivational filler and empty slogans."] },
    formatting: { do: ["Write five to seven blocks of two or three lines each; no lists."], dont: ["Use lists of unrelated tips."] },
    diction: { do: ["Blend a personal story with an idea from history or science."], dont: ["Arguments that never commit to a position."] },
    closings: { do: ["Return to the thesis in the last line and make it sharper."], dont: ["Add a call to action."] },
    global: { do: ["Offer one micro-experiment the reader can run today."], dont: ["Invent historical facts; use only what the author supplied."] },
    moves: [
      { label: "Bold thesis", pattern: "[Common excuse] is a story you tell to feel safe.", useWhen: "opening" },
      { label: "Two fields", pattern: "[Example from field A]. [Example from field B]. In both, [shared point].", useWhen: "building the argument" },
      { label: "Micro-experiment", pattern: "Today, spend [short time] on [ugliest part].", useWhen: "the post asks for action" },
    ],
    checks: ["Is the thesis stated in the first line?", "Are there examples from different fields?", "Does the last line sharpen the thesis?"],
    posts: WREN,
  },
];

export const PRESET_VOICES: PresetVoice[] = SPECS.map(compile);
