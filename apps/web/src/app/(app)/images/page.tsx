import { Upcoming } from "@/components/page";

export const metadata = { title: "Created by you" };

export default function Page() {
  return (
    <Upcoming
      title={"Created by you"}
      description={"Carousels, quote cards and visuals made for your posts, in your brand colours."}
      points={["Generate and edit images from a prompt.", "Keep every version and go back to any of them.", "Uses image credits from your plan."]}
    />
  );
}
