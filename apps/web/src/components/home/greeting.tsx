import { LineReveal } from "@brandloop/ui";
import type { Greeting as GreetingText } from "@/lib/greeting";

export const GREETING_LINE_2 = "What are we putting out there?";

/**
 * Home greeting (screens.md B1): one `<h1>` whose two lines rise through a clip mask on first paint only; line 2 is
 * `text-2`. The heading's text, and so its accessible name, is the full sentence once ("Good evening. What are we
 * putting out there?") from the first frame.
 */
export function Greeting({ greeting }: { greeting: GreetingText }) {
  return (
    <LineReveal
      as="h1"
      lines={[greeting, GREETING_LINE_2]}
      className="type-greeting text-text focus-visible:outline-none [&>span:last-child]:text-text-2"
    />
  );
}
