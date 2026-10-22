import { PageBody, PageHeader } from "@/components/page";
import { ImageLibrary } from "@/components/visuals/image-library";

export const metadata = { title: "Created by you" };

export default function Page() {
  return (
    <>
      <PageHeader
        className="max-w-[1120px]"
        title="Created by you"
        subtitle="Images made for your posts, in your brand colours. Open a post to add one."
      />
      <PageBody className="max-w-[1120px]">
        <ImageLibrary />
      </PageBody>
    </>
  );
}
