import { LibraryEmpty } from "@/components/ideas/library-empty";

export const metadata = { title: "Hooks" };

export default function Page() {
  return (
    <LibraryEmpty
      title="Hooks"
      description="Opening lines and post structures that work, ready to fill with your own story."
      heading="Hooks and post templates will appear here"
      points={[
        "Browse by type: educational, story, authority, lead generation.",
        "Save the opening lines of your own best posts as hooks.",
        "Use a hook to start a draft in your voice.",
      ]}
      needs="The hooks library isn't built yet. Until then, every idea on For you comes with a first line you can copy or draft from."
    />
  );
}
