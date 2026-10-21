import { Upcoming } from "@/components/page";

export const metadata = { title: "Templates" };

export default function Page() {
  return (
    <Upcoming
      title={"Templates"}
      description={"Proven post structures you can fill in with your own story."}
      points={["Browse by type: educational, story, authority, lead generation.", "Save your own posts as templates.", "Use a template to start a draft."]}
    />
  );
}
