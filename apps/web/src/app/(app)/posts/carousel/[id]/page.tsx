import { notFound } from "next/navigation";
import { getCarousel, getDocument } from "@brandloop/db";
import { CarouselStudio } from "@/components/carousel/carousel-studio";
import { getAccount } from "@/lib/account";
import { ASPECTS, TEMPLATES, type CarouselState, type Slide } from "@/lib/carousel/state";

export const metadata = { title: "Carousel studio" };

/** A saved carousel (`/posts/carousel/<id>`), reopened in the studio. Another profile's id is a 404. */
export default async function SavedCarouselPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = (await getAccount()).currentProfile;
  if (!profile) notFound();
  const row = await getCarousel(profile.id, (await params).id);
  if (!row) notFound();
  const doc = row.documentId ? await getDocument(profile.id, row.documentId) : null;

  const options = (row.options ?? {}) as { kit?: string; logo?: boolean };
  const slides = (Array.isArray(row.slides) ? (row.slides as Slide[]) : []).map((s) => ({ id: s.id, title: s.title, body: s.body }));
  const state: CarouselState = {
    slides,
    activeId: slides[0]?.id ?? null,
    template: (TEMPLATES as readonly string[]).includes(row.template) ? (row.template as CarouselState["template"]) : "ink",
    aspect: (ASPECTS as readonly string[]).includes(row.aspect) ? (row.aspect as CarouselState["aspect"]) : "4:5",
    kit: options.kit === "personal" ? "personal" : "orbit",
    logo: options.logo === true,
  };
  const person = profile.fullName?.trim() || profile.name || "";
  return (
    <CarouselStudio
      profileId={profile.id}
      author={person}
      source={doc ? { id: doc.id, title: doc.title, text: doc.text } : null}
      saved={{ id: row.id, revision: row.revision, state, pdfUrl: row.pdfUrl }}
      identities={{
        orbit: { brand: profile.company?.trim() || person, byline: [person, profile.jobTitle?.trim()].filter(Boolean).join(" · ") },
        personal: { brand: person, byline: profile.jobTitle?.trim() ?? "" },
      }}
    />
  );
}
