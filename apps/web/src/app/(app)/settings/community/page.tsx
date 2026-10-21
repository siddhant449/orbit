import { Upcoming } from "@/components/page";

export const metadata = { title: "Community" };

export default function Page() {
  return (
    <Upcoming
      title={"Community"}
      description={"Meet other members, join live sessions and share what's working."}
      points={["Weekly writing sessions.", "Feedback on drafts from peers."]}
    />
  );
}
