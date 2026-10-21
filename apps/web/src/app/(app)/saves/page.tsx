import { Upcoming } from "@/components/page";

export const metadata = { title: "All saves" };

export default function Page() {
  return (
    <Upcoming
      title={"All saves"}
      description={"Everything you've saved: posts, templates, ideas and images, organised into spaces."}
      points={["Create spaces and drag items into them.", "Pin the spaces you use most."]}
    />
  );
}
