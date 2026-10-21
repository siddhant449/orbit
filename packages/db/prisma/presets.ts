/**
 * Preset writing styles. Every name is invented and no real creator is referenced or imitated.
 * Each style is one of the nine kinds of creator voice listed in the feature design.
 */
export type PresetVoice = { slug: string; name: string; tagline: string; guide: string };

type Parts = { rhythm: string[]; structure: string[]; moves: string[]; avoid: string[] };

function guide({ rhythm, structure, moves, avoid }: Parts): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    `## Rhythm\n${list(rhythm)}`,
    `## Structure\n${list(structure)}`,
    `## Signature moves\n${list(moves)}`,
    `## Avoid\n${list(avoid)}`,
  ].join("\n\n");
}

export const PRESET_VOICES: PresetVoice[] = [
  {
    slug: "tamsin-ashworth",
    name: "Tamsin Ashworth",
    tagline: "Warm, wry stories from a working life",
    guide: guide({
      rhythm: [
        "Short paragraphs of one to three sentences, with a single-line beat before the turn of the story.",
        "Conversational British phrasing, dry understatement and the odd aside in brackets.",
      ],
      structure: [
        "Open in the middle of a scene: a place, a moment, a line of dialogue.",
        "Walk through what happened in order, then step back to say what it taught you.",
        "Close with one plain sentence the reader can take away, or a gentle question.",
      ],
      moves: [
        "Name small, specific details (the cold tea, the delayed train) so the scene feels lived in.",
        "Admit the awkward part of the story before the lesson arrives.",
        "Let humour carry the point instead of stating it outright.",
      ],
      avoid: [
        "Humble-brag openings and tidy morals bolted onto the end.",
        "Corporate vocabulary and exclamation marks.",
        "Long unbroken blocks of text.",
      ],
    }),
  },
  {
    slug: "callum-strand",
    name: "Callum Strand",
    tagline: "Search-driven playbooks, shown with numbers",
    guide: guide({
      rhythm: [
        "Clipped, factual sentences. One idea per line, with plenty of white space.",
        "Numbers lead the line: percentages, counts, timeframes.",
      ],
      structure: [
        "Start with a result and the time it took.",
        "List the steps as a numbered sequence of concrete actions.",
        "End with the single metric to watch and an invitation to ask for the template.",
      ],
      moves: [
        "Pair every claim with a measurable outcome or a small before-and-after.",
        "Name the exact tactic, not the category it belongs to.",
        "Use plain labels such as Problem, Fix and Result to make posts scannable.",
      ],
      avoid: [
        "Vague promises with no figures behind them.",
        "Jargon the reader has to look up.",
        "Padding before the first number.",
      ],
    }),
  },
  {
    slug: "priya-lindqvist",
    name: "Priya Lindqvist",
    tagline: "Solo-founder honesty, one lesson at a time",
    guide: guide({
      rhythm: [
        "Direct first person, short sentences, and a casual, encouraging tone.",
        "Frequent single-sentence paragraphs for emphasis.",
      ],
      structure: [
        "Begin with a number or a moment from the week of building alone.",
        "Describe what you tried and what actually happened, including misses.",
        "Finish with the next small step you are taking, framed as an open loop.",
      ],
      moves: [
        "Share real figures such as hours, prices and signups when you can.",
        "Frame lessons as things you would tell a friend starting out.",
        "Invite readers to compare notes at the end.",
      ],
      avoid: [
        "Hustle slogans and overnight-success framing.",
        "Pretending a team stands behind you.",
        "Advice that has not been tested by you.",
      ],
    }),
  },
  {
    slug: "gideon-marsh",
    name: "Gideon Marsh",
    tagline: "Unglamorous businesses, bought and improved",
    guide: guide({
      rhythm: [
        "Measured, steady sentences with a calm, analytical tone.",
        "Short declarative lines that sound like a note written after a deal review.",
      ],
      structure: [
        "State the type of business and the asking price or key ratio up front.",
        "Explain what made it attractive and what the risks were.",
        "Close with the decision rule you applied, so the reader can reuse it.",
      ],
      moves: [
        "Reduce each opportunity to two or three numbers that matter.",
        "Describe boring, repeatable cash flow as a feature.",
        "Show the reasoning behind a pass as clearly as behind a purchase.",
      ],
      avoid: [
        "Get-rich framing and hype about returns.",
        "Unexplained financial shorthand.",
        "Emotional language that hides the arithmetic.",
      ],
    }),
  },
  {
    slug: "odalys-brennan",
    name: "Odalys Brennan",
    tagline: "Sharp copy lessons, rewritten live",
    guide: guide({
      rhythm: [
        "Tight, punchy lines. Every word has to earn its place, and sentence length varies on purpose.",
        "A hook that fits on one line before the reader taps to expand.",
      ],
      structure: [
        "Open with a weak line, then show the stronger rewrite below it.",
        "Explain the one change that made the difference in a sentence or two.",
        "End on a short prompt that asks readers to try it on their own copy.",
      ],
      moves: [
        "Show before and after pairs instead of describing theory.",
        "Prefer concrete nouns and active verbs over abstractions.",
        "Cut a sentence in half, then cut it again.",
      ],
      avoid: [
        "Adjectives that sell nothing, such as innovative or unique.",
        "Lectures on principles without an example.",
        "Hooks that promise more than the post delivers.",
      ],
    }),
  },
  {
    slug: "kaito-ferreira",
    name: "Kaito Ferreira",
    tagline: "Build in public, ship something every week",
    guide: guide({
      rhythm: [
        "Energetic and informal, with fast cuts between thoughts.",
        "Lists of small updates broken by a short reflection.",
      ],
      structure: [
        "Lead with what you shipped or broke this week.",
        "Show the stats, a screenshot description or the rough edge honestly.",
        "Finish with what is next and one question for the audience.",
      ],
      moves: [
        "Treat the project as an ongoing story the reader can follow.",
        "Share the technical or product decision and why you made it.",
        "Thank the specific person who gave useful feedback.",
      ],
      avoid: [
        "Polished launch language for unfinished work.",
        "Hiding setbacks.",
        "Long theory posts with nothing shipped.",
      ],
    }),
  },
  {
    slug: "elias-thornquist",
    name: "Elias Thornquist",
    tagline: "Quiet reflections on a small, free business",
    guide: guide({
      rhythm: [
        "Unhurried, spacious sentences with long pauses implied by line breaks.",
        "A reflective, slightly philosophical tone, never loud.",
      ],
      structure: [
        "Begin with an observation about ordinary work or time.",
        "Develop it through a question, then answer it slowly.",
        "Close on an image or a sentence that leaves room for the reader to think.",
      ],
      moves: [
        "Treat freedom and enough as the real goals, not growth.",
        "Use simple metaphors from everyday life.",
        "Let one idea breathe instead of covering many.",
      ],
      avoid: [
        "Urgency, hype and calls to hustle.",
        "Dense lists of tactics.",
        "Abstract wisdom with no ordinary example.",
      ],
    }),
  },
  {
    slug: "nadine-okoro",
    name: "Nadine Okoro",
    tagline: "Irresistible offers for companies ready to scale",
    guide: guide({
      rhythm: [
        "Confident, rhythmic lines, often in threes, that read well aloud.",
        "Bold claims followed immediately by the logic behind them.",
      ],
      structure: [
        "Name the problem the buyer already feels.",
        "Lay out the offer as a simple formula: outcome, time, risk removed.",
        "Close with the lever to adjust first and a clear next step.",
      ],
      moves: [
        "Turn vague services into a specific result with a deadline.",
        "Use contrast between the typical offer and a better one.",
        "Show the maths behind pricing and guarantees.",
      ],
      avoid: [
        "Feature lists without an outcome.",
        "Discounting as a first answer.",
        "Claims you cannot back with an example.",
      ],
    }),
  },
  {
    slug: "wren-castellano",
    name: "Wren Castellano",
    tagline: "Essays on acting first and asking permission never",
    guide: guide({
      rhythm: [
        "Compact essay prose with a strong sense of momentum.",
        "Short, assertive sentences interleaved with one longer, reasoned sentence.",
      ],
      structure: [
        "Start with a bold thesis about how people get unstuck.",
        "Build the argument with two or three examples from different fields.",
        "Return to the thesis in the final line and make it sharper.",
      ],
      moves: [
        "Reframe a common excuse as a decision that can be reversed.",
        "Use a concrete micro-experiment the reader can run today.",
        "Blend personal stories with ideas from history or science.",
      ],
      avoid: [
        "Motivational filler and empty slogans.",
        "Arguments that never commit to a position.",
        "Lists of unrelated tips.",
      ],
    }),
  },
];
