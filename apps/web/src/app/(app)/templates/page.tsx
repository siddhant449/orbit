import { Upcoming } from "@/components/page";

export const metadata = { title: "Hooks" };

export default function Page() {
  return (
    <Upcoming
      title={"Hooks"}
      description={"Opening lines and post structures that work, ready to fill with your own story."}
      points={["Browse by type: educational, story, authority, lead generation.", "Save your own posts as hooks.", "Use a hook to start a draft."]}
    />
  );
}
