import { Upcoming } from "@/components/page";

export const metadata = { title: "Posts" };

export default function Page() {
  return (
    <Upcoming
      title={"Posts"}
      description={"Every draft, scheduled and published post for this profile, on a board, a list or a calendar."}
      points={["Move posts between Ideas, Draft, Scheduled and Published, or add your own columns.", "Schedule to LinkedIn at the best time in your timezone.", "Open any post to edit it with the AI beside you."]}
    />
  );
}
