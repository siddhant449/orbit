import { Upcoming } from "@/components/page";

export const metadata = { title: "Knowledge base" };

export default function Page() {
  return (
    <Upcoming
      title={"Knowledge base"}
      description={"The material the AI draws on when it writes for you: notes, documents, videos and links."}
      points={["Add text, files, YouTube videos or web pages.", "Everything stays private to this profile."]}
    />
  );
}
