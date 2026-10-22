import { LibraryEmpty } from "@/components/ideas/library-empty";

export const metadata = { title: "Following" };

export default function Page() {
  return (
    <LibraryEmpty
      title="Following"
      description="Creators, channels and news sources you follow, so your ideas reflect what's happening in your field."
      heading="The sources you follow will appear here"
      points={["Follow a creator by profile URL, or a channel or newsletter by link.", "New posts from them feed into your weekly ideas."]}
      needs="Following needs connected sources (LinkedIn, YouTube, RSS). None are connected yet."
    />
  );
}
