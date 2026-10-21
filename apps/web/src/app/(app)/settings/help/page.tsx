import { Upcoming } from "@/components/page";

export const metadata = { title: "Talk to a person" };

export default function Page() {
  return (
    <Upcoming
      title={"Talk to a person"}
      description={"Questions about your account or how to get more from Brandloop."}
      points={["Send us a message and a person will reply by email."]}
    />
  );
}
