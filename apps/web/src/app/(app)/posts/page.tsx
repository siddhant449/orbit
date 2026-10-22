import { listPosts } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { PostsScreen } from "@/components/posts/posts-screen";
import { clipText, safeTimeZone } from "@/components/posts/posts-view";

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
  const { posts, total } = await listPosts(profile.id);
  return (
    <PostsScreen
      posts={posts.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        version: p.version,
        // Only the excerpt and search use the text; the full post stays on the server.
        text: clipText(p.text),
        chatId: p.chatId,
        updatedAt: p.updatedAt.toISOString(),
      }))}
      total={total}
      timeZone={safeTimeZone(profile.timezone)}
      nowISO={new Date().toISOString()}
    />
  );
}
