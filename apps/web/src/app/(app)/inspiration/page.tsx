import { LibraryEmpty } from "@/components/ideas/library-empty";

export const metadata = { title: "Swipe file" };

export default function Page() {
  return (
    <LibraryEmpty
      title="Swipe file"
      description="LinkedIn posts that performed well, to learn from and build on."
      heading="Posts worth learning from will appear here"
      points={[
        "Filter by topic, and find outliers and hidden gems from creators your size.",
        "Save a post to your library, or use it as the starting point for a draft of your own.",
      ]}
      needs="The swipe file needs a source of public LinkedIn posts Orbit is allowed to show. It isn't connected yet, so nothing here is sample data."
    />
  );
}
