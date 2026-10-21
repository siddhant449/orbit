import { Upcoming } from "@/components/page";

export const metadata = { title: "Activities" };

export default function Page() {
  return (
    <Upcoming
      title={"Activities"}
      description={"Your weekly posting and engagement goals, with a streak that keeps you consistent."}
      points={["Weekly goals for posts, comments, messages and connection requests.", "A getting-started checklist with short tutorials.", "Milestones as you build the habit."]}
    />
  );
}
