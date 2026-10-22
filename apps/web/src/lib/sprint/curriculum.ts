/**
 * Orbit's 30-day sprint curriculum: one post format per weekday, in order. Thirty calendar days hold 20 to 22
 * weekdays depending on the start day, so there are 22 formats and a short sprint simply ends before the last ones.
 * Weekends are rest days and take no format. All wording here is Orbit's own.
 */
export type SprintFormat = {
  /** Stable slug, used in links (`/?draft=<id>`) and later as the persisted format key. */
  id: string;
  title: string;
  /** What to write, in one or two sentences. */
  brief: string;
  /** The shape of the post, in order. */
  steps: readonly [string, string, string];
  /** One possible opening line, to show the tone. Generic on purpose: the writer brings the specifics. */
  example: string;
};

export const SPRINT_FORMATS: readonly SprintFormat[] = [
  {
    id: "origin-story",
    title: "The origin story",
    brief: "Why you do this work at all. One moment that set you on this path, told plainly, ending on what it means for the people you help now.",
    steps: ["Open on the moment, not the backstory", "Say what you believed before and what changed", "Close on how it shapes the way you work today"],
    example: "I didn't choose this job. A spreadsheet with one wrong number chose it for me.",
  },
  {
    id: "contrarian-take",
    title: "The contrarian take",
    brief: "A piece of common advice in your field that you think is wrong, or right only in a narrow case. Disagree with the idea, never with a person.",
    steps: ["State the popular advice in one line", "Explain where it breaks, with one example from your work", "Offer what you do instead"],
    example: "Everyone says to niche down early. I waited two years, and it was the best call I made.",
  },
  {
    id: "checklist",
    title: "The checklist",
    brief: "The short list you actually run before a task you do often. Five to seven items, each one specific enough to copy.",
    steps: ["Name the task and why it goes wrong", "List the items, one line each", "Point to the one item people skip most"],
    example: "Before any client call, I run the same six checks. Number four saves me every week.",
  },
  {
    id: "customer-number",
    title: "The customer number",
    brief: "One result you got for someone, built around a single number. What the situation was, what you changed, and what moved.",
    steps: ["Lead with the number and the time it took", "Describe the starting point in two lines", "Name the one change that mattered most"],
    example: "Thirty-one days, one change to the onboarding email, and replies went from four to forty.",
  },
  {
    id: "before-after",
    title: "Before and after",
    brief: "Show the same thing twice: how it looked before and how it looks now. Let the contrast do the work, then explain the difference.",
    steps: ["Show the before honestly, flaws included", "Show the after", "Explain the two or three decisions in between"],
    example: "Here's the proposal I sent last year, and the one I send now. The second one is half as long.",
  },
  {
    id: "costly-mistake",
    title: "The costly mistake",
    brief: "A mistake that cost you money, time or a client, and what you do differently because of it. Own it without drama.",
    steps: ["Say what happened and what it cost", "Name the assumption behind it", "Share the rule you follow now"],
    example: "I once lost a month of work because I didn't ask one question at kickoff.",
  },
  {
    id: "industry-myth",
    title: "The myth you'd retire",
    brief: "Something people in your industry repeat that isn't true any more, if it ever was. Explain why it sticks around and what's true instead.",
    steps: ["Name the myth the way people say it", "Show why it's wrong with something you've seen", "Replace it with a better rule of thumb"],
    example: "\"Nobody reads long posts.\" My longest post this year is also my most saved.",
  },
  {
    id: "real-process",
    title: "How it really gets done",
    brief: "The unpolished version of a process you're known for. The steps nobody sees, including the boring ones.",
    steps: ["Pick one deliverable people recognise", "Walk through the steps in order", "Call out the step that takes longest"],
    example: "People see the finished deck. They don't see the four hours of interviews before slide one.",
  },
  {
    id: "dropped-tool",
    title: "The tool you dropped",
    brief: "A tool, app or habit you stopped using, and what replaced it. Be fair to the old one and specific about why you switched.",
    steps: ["Say what you used and for how long", "Name the moment it stopped working for you", "Share what you use now and the trade-off"],
    example: "I used a project tool with forty features for three years. Now I use a shared doc and a calendar.",
  },
  {
    id: "one-number-lesson",
    title: "One number, one lesson",
    brief: "A single metric from your work or your field and the lesson hiding in it. Keep it to one number and one idea.",
    steps: ["Show the number with enough context to read it", "Say what most people conclude from it", "Say what you conclude instead"],
    example: "Eighty percent of my leads came from twelve percent of my posts. Here's what those posts had in common.",
  },
  {
    id: "day-in-the-work",
    title: "A day in the work",
    brief: "One real working day, start to finish, with the parts that surprised you. Show the job as it is, not as it looks from outside.",
    steps: ["Pick a recent, ordinary day", "Walk through it in time order, briefly", "End on the one moment that made the day worth it"],
    example: "Seven meetings, two decisions, one problem solved on a walk. A normal Tuesday.",
  },
  {
    id: "lesson-from-someone",
    title: "The lesson someone gave you",
    brief: "Something a manager, client or peer taught you that stuck. Keep them anonymous and keep the focus on the lesson.",
    steps: ["Set the scene in one or two lines", "Quote or paraphrase what they said", "Show how you use it today"],
    example: "My first manager handed back my report with one note: \"Who is this for?\" I still ask it daily.",
  },
  {
    id: "boring-habit",
    title: "The boring habit",
    brief: "A small, unglamorous habit that does more for your results than anything flashy. Make it easy to try tomorrow.",
    steps: ["Name the habit in plain words", "Explain why it works", "Give the smallest version someone can start with"],
    example: "Every Friday I write down three things that went wrong. It takes ten minutes and it's my best habit.",
  },
  {
    id: "first-question",
    title: "What people ask first",
    brief: "The question you hear first from almost every new client or reader, answered properly once, in public.",
    steps: ["Write the question the way people ask it", "Give the short answer", "Give the nuance most answers leave out"],
    example: "\"How long until this works?\" Here's the honest answer I give every new client.",
  },
  {
    id: "stopped-doing",
    title: "What you stopped doing",
    brief: "Something you used to do because you thought you had to, and what happened when you stopped.",
    steps: ["Say what you stopped and why you used to do it", "Describe what you feared would happen", "Share what actually happened"],
    example: "I stopped sending weekly status reports. Not one client noticed. Here's what I send instead.",
  },
  {
    id: "next-year",
    title: "Where it's heading",
    brief: "One change you expect in your field over the next year or two, why you think so, and what you're doing about it now.",
    steps: ["State the prediction clearly", "Give the two signals behind it", "Say how you're preparing"],
    example: "Within a year, the first draft won't be the hard part of this job. The brief will be.",
  },
  {
    id: "one-page-resource",
    title: "The one-page resource",
    brief: "A template, framework or cheat sheet you'd hand a new colleague on day one, written out in the post itself.",
    steps: ["Say who it's for and when to use it", "Lay out the resource in short lines", "Add one tip for using it well"],
    example: "The one-page brief I ask every client to fill in before we start. Copy it.",
  },
  {
    id: "second-step",
    title: "The step after the basics",
    brief: "Most advice stops at step one. Teach the step that comes next, for people who already know the basics.",
    steps: ["Name the basic advice everyone has heard", "Explain where people get stuck after it", "Teach the next step concretely"],
    example: "You already know to post consistently. Here's what to do once that stops being enough.",
  },
  {
    id: "not-my-job",
    title: "What your job isn't",
    brief: "Clear up a common misunderstanding about your role. What people expect from you, and what you actually do.",
    steps: ["Name the misconception", "Describe the real job in a few lines", "Explain why the difference matters to clients"],
    example: "People think my job is writing. It's mostly deciding what not to write.",
  },
  {
    id: "why-still",
    title: "Why you still do this",
    brief: "After the hard days, why you keep going. Something specific, not a slogan.",
    steps: ["Admit one hard thing about the work", "Share the moment that keeps you in it", "Say what you hope to do next"],
    example: "Some weeks this job is all invoices and inboxes. Then a message like this one arrives.",
  },
  {
    id: "ignored-advice",
    title: "The advice you ignored",
    brief: "Advice you were given and didn't take, and whether you were right. Either answer makes a good post.",
    steps: ["Say what the advice was and who it came from, without names", "Explain why you ignored it", "Judge the outcome honestly"],
    example: "I was told never to work with friends. I did it anyway. Here's how that went.",
  },
  {
    id: "sprint-recap",
    title: "What the sprint taught you",
    brief: "Look back on the sprint: what you posted, what landed, what surprised you, and what you'll keep doing.",
    steps: ["Say what you set out to do", "Share the post or idea that surprised you most", "Name the habit you'll keep"],
    example: "Thirty days ago I set myself a simple goal: show up every weekday. Here's what I learned.",
  },
];

const BY_ID = new Map(SPRINT_FORMATS.map((f) => [f.id, f]));

export function findSprintFormat(id: string | undefined | null): SprintFormat | null {
  return (id && BY_ID.get(id)) || null;
}

/**
 * The first message of a sprint chat: the format, what to write and its shape. The agent asks for missing specifics
 * before drafting, so the post is about the writer, not a template.
 */
export function sprintDraftPrompt(format: SprintFormat, day?: number): string {
  const lead = day ? `Day ${day} of my 30-day sprint: ${format.title}.` : `Sprint format: ${format.title}.`;
  return [
    `${lead} Help me write this post.`,
    format.brief,
    `Shape:\n${format.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    "If you need details only I would know, ask me one or two short questions first, then draft it.",
  ].join("\n\n");
}
