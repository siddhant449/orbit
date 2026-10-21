import { Upcoming } from "@/components/page";

export const metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Upcoming
      title={"Analytics"}
      description={"How your posts and profile are performing on LinkedIn."}
      points={["Impressions, engagement and follower growth over time.", "Per-post breakdowns.", "Requires connecting your LinkedIn account."]}
    />
  );
}
