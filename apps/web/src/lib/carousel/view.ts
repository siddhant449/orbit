/** Small view helpers for the carousel studio header and labels. */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => WORDS[n] ?? String(n);

/** Slide text without the `*accent*` markers, for labels, thumbnails and screen readers. */
export function plainText(text: string): string {
  return text.replace(/\*([^*]*)\*/g, "$1");
}

const NAME_MAX = 56;

/** The page heading (artboard: "The free tier, in six slides"): the source post's name and the slide count. */
export function carouselHeading(name: string, count: number): string {
  let base = plainText(name).trim().replace(/[.!]+$/, "");
  if (base.length > NAME_MAX) base = `${base.slice(0, NAME_MAX - 1).trimEnd()}…`;
  if (count === 0) return base || "New carousel";
  const slides = `${word(count)} ${count === 1 ? "slide" : "slides"}`;
  return base ? `${base}, in ${slides}` : `A carousel in ${slides}`;
}
