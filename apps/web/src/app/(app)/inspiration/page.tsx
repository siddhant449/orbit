import { Upcoming } from "@/components/page";

export const metadata = { title: "Swipe file" };

export default function Page() {
  return (
    <Upcoming
      title={"Swipe file"}
      description={"Real LinkedIn posts that performed well, filtered by topic, format and audience size."}
      points={["Find outliers and hidden gems from creators your size.", "Save posts to your library.", "Use a post as the starting point for your own."]}
    />
  );
}
