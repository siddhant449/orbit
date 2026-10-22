import { LibraryEmpty } from "@/components/ideas/library-empty";

export const metadata = { title: "All saves" };

export default function Page() {
  return (
    <LibraryEmpty
      title="All saves"
      description="Everything you've saved: posts, hooks, ideas and images, organised into spaces."
      heading="Your saved posts, hooks and ideas will appear here"
      points={["Create spaces and drag items into them.", "Pin the spaces you use most."]}
      needs="Saving isn't built yet, so there's nothing to show. Ideas you generate stay on For you for this browser tab."
    />
  );
}
