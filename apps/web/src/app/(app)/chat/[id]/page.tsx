import { notFound } from "next/navigation";
import { getChat, getChatDocument, getSelectedVoice, listMessages, listVoices } from "@brandloop/db";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { ChatView } from "@/components/chat/chat-view";
import { getAccount } from "@/lib/account";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { currentProfile: profile } = await getAccount();
  if (!profile) notFound();
  const chat = await getChat(profile.id, id);
  if (!chat) notFound();
  const [messages, voices, selected, doc] = await Promise.all([
    listMessages(profile.id, id),
    listVoices(profile.id),
    getSelectedVoice(profile.id),
    getChatDocument(profile.id, id),
  ]);
  const initialMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
    ...(m.metadata ? { metadata: m.metadata } : {}),
  })) as ChatUIMessage[];
  return (
    <ChatView
      key={id}
      chatId={id}
      title={chat.title}
      initialMessages={initialMessages}
      voices={voices.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline, own: v.kind === "OWN" }))}
      selectedVoiceId={selected?.id ?? null}
      initialDocument={doc ? { id: doc.id, title: doc.title, version: doc.version, currentVersion: doc.currentVersion, text: doc.text } : null}
    />
  );
}
