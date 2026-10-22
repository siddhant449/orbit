import { HomeChat } from "@/components/chat/home-chat";
import { HomeCards } from "@/components/home/home-cards";
import { getAccount } from "@/lib/account";
import { greetingFor } from "@/lib/greeting";
import { promptParam } from "@/lib/prompt-param";
import { latestChatOf, summarizeStrategy } from "@/lib/home-summary";
import { getSelectedVoice, getStrategy, listChats, listVoices } from "@brandloop/db";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const initialText = promptParam((await searchParams).prompt);
  const account = await getAccount();
  const profile = account.currentProfile;
  const timeZone = profile?.timezone ?? "UTC";
  const now = new Date();
  const [voices, selected, strategy, history] = profile
    ? await Promise.all([listVoices(profile.id), getSelectedVoice(profile.id), getStrategy(profile.id), listChats(profile.id, { limit: 20 })])
    : [[], null, null, { chats: [] }];
  return (
    <HomeChat
      greeting={greetingFor(now, timeZone)}
      cards={<HomeCards strategy={summarizeStrategy(strategy, now, timeZone)} latestChat={latestChatOf(history.chats)} now={now} />}
      voices={voices.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline, own: v.kind === "OWN" }))}
      selectedVoiceId={selected?.id ?? null}
      initialText={initialText}
    />
  );
}
