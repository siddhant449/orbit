import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getDocument, getSelectedVoice, listMessages, listVoices } from "@brandloop/db";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { PostEditorView } from "@/components/editor/post-editor-view";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Post" };

/** Document mode (screens.md B3): the current profile's post with its chat. Any other id is a 404. */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { currentProfile: profile } = await getAccount();
  if (!profile) notFound();
  const doc = await getDocument(profile.id, id);
  if (!doc) notFound();
  const [messages, voices, selected] = await Promise.all([
    doc.chatId ? listMessages(profile.id, doc.chatId) : Promise.resolve([]),
    listVoices(profile.id),
    getSelectedVoice(profile.id),
  ]);
  const initialMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
    ...(m.metadata ? { metadata: m.metadata } : {}),
  })) as ChatUIMessage[];
  // A post whose chat was deleted gets this id as a new chat on its first send.
  const chatId = doc.chatId ?? randomUUID();
  return (
    <PostEditorView
      key={`${doc.id}:${chatId}`}
      doc={{ id: doc.id, title: doc.title, version: doc.version, text: doc.text, updatedAt: doc.updatedAt.toISOString() }}
      chat={{ id: chatId, linked: Boolean(doc.chatId), messages: initialMessages }}
      voices={voices.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline, own: v.kind === "OWN" }))}
      selectedVoiceId={selected?.id ?? null}
    />
  );
}
