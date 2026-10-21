import { Upcoming } from "@/components/page";

export const metadata = { title: "Memories" };

export default function Page() {
  return (
    <Upcoming
      title={"Memories"}
      description={"Facts the AI remembers about you between chats."}
      points={["Review, edit or delete anything it has learned.", "Add memories yourself."]}
    />
  );
}
