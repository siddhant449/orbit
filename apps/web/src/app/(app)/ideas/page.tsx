import { Upcoming } from "@/components/page";

export const metadata = { title: "For you" };

export default function Page() {
  return (
    <Upcoming
      title={"For you"}
      description={"A fresh set of post ideas each week, written from your strategy, knowledge base and recent posts."}
      points={["Pick the day new ideas arrive.", "Turn any idea into a draft in one click.", "Ideas pause while you're doing the 30-day challenge."]}
    />
  );
}
