import { listCarousels, listPosts } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { PostsScreen } from "@/components/posts/posts-screen";
import { clipText, safeTimeZone, type PostRow } from "@/components/posts/posts-view";

export const metadata = { title: "Posts" };

/** Posts (screens.md B5 / B6): `?view=board|list|calendar`, read from the profile's real posts. */
export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  if (!profile) {
    return (
      <>
        <PageHeader title="Posts" />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to start writing posts." />
        </PageBody>
      </>
    );
  }
  const [{ posts, total }, carousels] = await Promise.all([listPosts(profile.id), listCarousels(profile.id)]);
  const rows: PostRow[] = [
    ...posts.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      version: p.version,
      // Only the excerpt and search use the text; the full post stays on the server.
      text: clipText(p.text),
      chatId: p.chatId,
      updatedAt: p.updatedAt.toISOString(),
    })),
    ...carousels.map((c) => ({
      id: c.id,
      title: c.title,
      status: "DRAFT" as const,
      version: 1,
      text: `${c.slideCount} ${c.slideCount === 1 ? "slide" : "slides"}. ${c.firstSlide}`,
      chatId: null,
      updatedAt: c.updatedAt.toISOString(),
      kind: "carousel" as const,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <PostsScreen
      posts={rows}
      total={total + carousels.length}
      timeZone={safeTimeZone(profile.timezone)}
      nowISO={new Date().toISOString()}
    />
  );
}
