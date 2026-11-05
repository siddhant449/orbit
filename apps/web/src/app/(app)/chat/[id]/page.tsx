import { notFound } from "next/navigation";
import { getChat, getChatDocument, getIdea, getSelectedVoice, listMessages, listVoices } from "@brandloop/db";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { ChatViewLazy as ChatView } from "@/components/chat/chat-view-lazy";
import { getAccount } from "@/lib/account";

export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ idea?: string | string[] }> }) {
  const { id } = await params;
  const { idea: ideaParam } = await searchParams;
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
  // "Draft" on a For you card opens the chat it made with the idea's prompt; a chat that already has messages never re-sends it.
  const ideaId = typeof ideaParam === "string" ? ideaParam : undefined;
  const idea = ideaId && messages.length === 0 ? await getIdea(profile.id, ideaId) : null;
  const initialText = idea && idea.chatId === id ? idea.prompt : undefined;
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
      initialText={initialText}
      voices={voices.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline, own: v.kind === "OWN" }))}
      selectedVoiceId={selected?.id ?? null}
      initialDocument={doc ? { id: doc.id, title: doc.title, version: doc.version, currentVersion: doc.currentVersion, text: doc.text } : null}
    />
  );
}
