import { Upcoming } from "@/components/page";

export const metadata = { title: "Talk to us" };

export default function Page() {
  return (
    <Upcoming
      title={"Talk to us"}
      description={"Questions about your account or how to get more from Orbit."}
      points={["Send us a message and a person will reply by email."]}
    />
  );
}
