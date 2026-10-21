import { HomeChat } from "@/components/chat/home-chat";
import { getAccount } from "@/lib/account";
import { getSelectedVoice, listVoices } from "@brandloop/db";

export default async function HomePage() {
  const account = await getAccount();
  const profile = account.currentProfile;
  const firstName = (profile?.name ?? account.user.name ?? "").split(" ")[0] ?? "";
  const [voices, selected] = profile ? await Promise.all([listVoices(profile.id), getSelectedVoice(profile.id)]) : [[], null];
  return (
    <HomeChat
      firstName={firstName}
      voices={voices.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline, own: v.kind === "OWN" }))}
      selectedVoiceId={selected?.id ?? null}
    />
  );
}
