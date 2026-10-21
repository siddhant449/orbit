import { Upcoming } from "@/components/page";

export const metadata = { title: "Images" };

export default function Page() {
  return (
    <Upcoming
      title={"Images"}
      description={"Carousels, quote cards and visuals made for your posts, in your brand colours."}
      points={["Generate and edit images from a prompt.", "Keep every version and go back to any of them.", "Uses image credits from your plan."]}
    />
  );
}
