import { Upcoming } from "@/components/page";

export const metadata = { title: "Following" };

export default function Page() {
  return (
    <Upcoming
      title={"Following"}
      description={"Creators, YouTube channels and news sources you follow, so new ideas reflect what's happening in your field."}
      points={["Follow by profile URL or channel.", "New items feed into your weekly ideas."]}
    />
  );
}
