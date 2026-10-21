import { Upcoming } from "@/components/page";

export const metadata = { title: "Integrations" };

export default function Page() {
  return (
    <Upcoming
      title={"Integrations"}
      description={"Connect the accounts and tools that make your writing better."}
      points={["LinkedIn for publishing and analytics.", "Notes, docs and meeting recorders as sources for posts.", "Use Brandloop from other AI assistants."]}
    />
  );
}
