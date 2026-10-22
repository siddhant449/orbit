import type { StyleProfile } from "@brandloop/ai";

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

function layoutSentence(p: StyleProfile): string {
  const l = p.layout;
  const bits = [
    `Hooks about ${Math.round(l.hookChars.typical)} characters`,
    `${Math.round(l.blocks.low)}-${Math.round(l.blocks.high)} blocks`,
    `${Math.round(l.postChars.low)}-${Math.round(l.postChars.high)} characters in all`,
  ];
  const lists = Math.max(l.listPosts.bullet, l.listPosts.numbered);
  bits.push(lists > 0 ? `lists in ${Math.round(l.listPosts.bullet + l.listPosts.numbered)}% of posts` : "no lists");
  return `${bits.join(", ")}.`;
}

/**
 * The prose form of a compiled profile, written to `VoiceStyle.guide` on every save so older readers (the orchestrator's
 * style name, the voice/style memory mirror, rows without a profile) keep working. Keeps the four classic sections.
 */
export function renderProfileGuide(p: StyleProfile): string {
  const r = p.rules;
  return [
    `## Voice\n${p.voiceTarget}`,
    `## Layout\n${layoutSentence(p)}`,
    `## Rhythm\n${list([...r.rhythm.do, ...r.hooks.do])}`,
    `## Structure\n${list([...r.formatting.do, ...r.closings.do])}`,
    `## Signature moves\n${list(p.signatureMoves.map((m) => `${m.label}: ${m.pattern} (use when ${m.useWhen})`))}`,
    `## Avoid\n${list([...r.hooks.dont, ...r.rhythm.dont, ...r.formatting.dont, ...r.diction.dont, ...r.closings.dont, ...r.global.dont])}`,
  ].join("\n\n");
}
