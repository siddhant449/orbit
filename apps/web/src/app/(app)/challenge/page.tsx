import { Upcoming } from "@/components/page";

export const metadata = { title: "30-day challenge" };

export default function Page() {
  return (
    <Upcoming
      title={"30-day challenge"}
      description={"Thirty days, one proven post format each weekday, with a short walkthrough for each."}
      points={["Today's format, examples and a draft ready to edit.", "Catch-up and rest days built in.", "Hands off to your content strategy when you finish."]}
    />
  );
}
