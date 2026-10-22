/** Fifteen kinds of LinkedIn post, described in our own words. */
export type Category = { id: string; label: string; description: string };

export const CATEGORIES: readonly Category[] = [
  { id: "educational", label: "Educational", description: "Teaches one useful thing the reader can apply today." },
  { id: "story", label: "Story", description: "A real moment told in order, with what it changed." },
  { id: "opinion", label: "Opinion", description: "A clear position, the reason, and the strongest objection." },
  { id: "case-study", label: "Case study", description: "One piece of work: the starting point, the move, the result." },
  { id: "framework", label: "Framework", description: "A named way of thinking, in steps the reader can reuse." },
  { id: "listicle", label: "Listicle", description: "A list of parallel items, each of which stands alone." },
  { id: "news", label: "News take", description: "A recent event and what it means for the audience." },
  { id: "prediction", label: "Prediction", description: "Where something is heading and why." },
  { id: "comparison", label: "Comparison", description: "Two options weighed against each other, with a verdict." },
  { id: "lesson", label: "Lesson learned", description: "A mistake or surprise and the rule it produced." },
  { id: "behind-the-scenes", label: "Behind the scenes", description: "How the work really gets done, including the messy parts." },
  { id: "announcement", label: "Announcement", description: "News from the author, stated plainly with who it is for." },
  { id: "engagement", label: "Question to the audience", description: "A focused question that invites specific answers." },
  { id: "authority", label: "Authority", description: "Shows depth through a specific, checkable insight." },
  { id: "personal", label: "Personal", description: "A human moment that shows who the author is." },
];
