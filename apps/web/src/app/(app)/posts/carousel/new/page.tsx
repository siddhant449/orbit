import { getDocument } from "@brandloop/db";
import { CarouselStudio } from "@/components/carousel/carousel-studio";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Carousel studio" };

/**
 * Carousel studio (screens.md B4, p07 / p20). `?document=<id>` starts from one of the profile's posts (the chat's
 * "Make a carousel"); another profile's id simply isn't found. The profile's own name, title and company sign the
 * slides; nothing is stored server-side.
 */
export default async function CarouselNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await getAccount();
  const profile = account.currentProfile;
  const { document } = await searchParams;
  const doc = profile && typeof document === "string" && document.length <= 64 ? await getDocument(profile.id, document) : null;

  const person = profile?.fullName?.trim() || profile?.name || "";
  const byline = [person, profile?.jobTitle?.trim()].filter(Boolean).join(" · ");
  return (
    <CarouselStudio
      source={doc ? { id: doc.id, title: doc.title, text: doc.text } : null}
      identities={{
        orbit: { brand: profile?.company?.trim() || person, byline },
        personal: { brand: person, byline: profile?.jobTitle?.trim() ?? "" },
      }}
    />
  );
}
