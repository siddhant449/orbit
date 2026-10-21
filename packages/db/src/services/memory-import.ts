import { ExtractedMemorySchema, looksLikeRefusal, type AiClient } from "@brandloop/ai";
import { appendMemoryLines, listMemory, memoryLines } from "./memory";

const FIXED_KEYS = new Set(["identity/about", "identity/personal", "identity/story", "writing/rules"]);
const TOPIC_KEY = /^topics\/[a-z0-9-]+$/;
const isAllowedKey = (key: string) => FIXED_KEYS.has(key) || TOPIC_KEY.test(key);

const SYSTEM =
  "You extract durable facts about a person from text they pasted (for example a memory export from another AI assistant). " +
  "Return only facts that are actually stated. Never invent facts and never reply conversationally. " +
  "If the text contains no usable facts, set refusal to true and return no facts.";

export async function importMemories(
  ai: AiClient,
  profileId: string,
  text: string,
): Promise<{ saved: number }> {
  const result = await ai.json({
    model: "extract",
    system: SYSTEM,
    prompt:
      "Extract first-person facts (written as short statements, for example \"Runs a design studio\") and sort them into these keys:\n" +
      "- identity/about: role, company, what they do\n" +
      "- identity/personal: personal details, hobbies, family\n" +
      "- identity/story: career story and milestones\n" +
      "- writing/rules: how they like to write, words to use or avoid\n" +
      "- topics/<slug>: subjects they write about, slug in lowercase-with-hyphens\n\n" +
      `Text:\n"""\n${text}\n"""`,
    schema: ExtractedMemorySchema,
  });

  const byKey = new Map<string, string[]>();
  if (!result.refusal) {
    for (const fact of result.facts) {
      const t = fact.text.trim();
      if (t.length < 8 || looksLikeRefusal(t) || !isAllowedKey(fact.key)) continue;
      byKey.set(fact.key, [...(byKey.get(fact.key) ?? []), t]);
    }
  }
  if (byKey.size === 0) throw new Error("Couldn't find facts to save");

  const before = new Map((await listMemory(profileId)).map((d) => [d.key, memoryLines(d.content).length]));
  let saved = 0;
  for (const [key, lines] of byKey) {
    const doc = await appendMemoryLines(profileId, key, lines, "IMPORTED");
    saved += memoryLines(doc.content).length - (before.get(key) ?? 0);
  }
  return { saved };
}
