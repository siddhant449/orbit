import { prisma } from "../client";
import { Prisma } from "../generated/prisma/client";
import type { Carousel } from "../generated/prisma/client";

/** Saved carousels (studio). Every read and write is scoped to the profile. `revision` is the concurrency token. */

export class CarouselNotFound extends Error {
  constructor() {
    super("Carousel not found.");
    this.name = "CarouselNotFound";
  }
}

export class CarouselConflict extends Error {
  constructor(readonly currentRevision: number) {
    super(`The carousel is now at revision ${currentRevision}.`);
    this.name = "CarouselConflict";
  }
}

export type CarouselContent = {
  title: string;
  template: string;
  aspect: string;
  options: Record<string, unknown>;
  slides: unknown[];
};

export type CarouselSummary = {
  id: string;
  title: string;
  slideCount: number;
  firstSlide: string;
  documentId: string | null;
  updatedAt: Date;
};

async function ownedDocument(profileId: string, documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, profileId, deletedAt: null }, select: { id: true } });
  if (!doc) throw new CarouselNotFound();
}

export async function createCarousel(profileId: string, input: CarouselContent & { documentId?: string | null }): Promise<Carousel> {
  if (input.documentId) await ownedDocument(profileId, input.documentId);
  return prisma.carousel.create({
    data: {
      profileId,
      documentId: input.documentId ?? null,
      title: input.title,
      template: input.template,
      aspect: input.aspect,
      options: input.options as Prisma.InputJsonValue,
      slides: input.slides as Prisma.InputJsonValue,
    },
  });
}

export function getCarousel(profileId: string, id: string): Promise<Carousel | null> {
  return prisma.carousel.findFirst({ where: { id, profileId, deletedAt: null } });
}

export async function listCarousels(profileId: string): Promise<CarouselSummary[]> {
  const rows = await prisma.carousel.findMany({
    where: { profileId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, slides: true, documentId: true, updatedAt: true },
  });
  return rows.map((r) => {
    const slides = Array.isArray(r.slides) ? (r.slides as { title?: unknown; body?: unknown }[]) : [];
    const first = slides[0];
    const text = [first?.title, first?.body].filter((x): x is string => typeof x === "string").join(" ");
    return { id: r.id, title: r.title, slideCount: slides.length, firstSlide: text.slice(0, 200), documentId: r.documentId, updatedAt: r.updatedAt };
  });
}

/** Saves the content when `expectedRevision` is current (else CarouselConflict); bumps `version` and `revision`. */
export async function saveCarousel(profileId: string, id: string, content: CarouselContent, expectedRevision: number): Promise<Carousel> {
  const { count } = await prisma.carousel.updateMany({
    where: { id, profileId, deletedAt: null, revision: expectedRevision },
    data: {
      title: content.title,
      template: content.template,
      aspect: content.aspect,
      options: content.options as Prisma.InputJsonValue,
      slides: content.slides as Prisma.InputJsonValue,
      version: { increment: 1 },
      revision: { increment: 1 },
    },
  });
  const row = await getCarousel(profileId, id);
  if (!row) throw new CarouselNotFound();
  if (count === 0) throw new CarouselConflict(row.revision);
  return row;
}

export async function deleteCarousel(profileId: string, id: string): Promise<boolean> {
  const { count } = await prisma.carousel.updateMany({ where: { id, profileId, deletedAt: null }, data: { deletedAt: new Date() } });
  return count > 0;
}

/** Links the carousel to one of the profile's posts (null unlinks). */
export async function attachCarousel(profileId: string, id: string, documentId: string | null): Promise<Carousel> {
  if (documentId) await ownedDocument(profileId, documentId);
  const { count } = await prisma.carousel.updateMany({ where: { id, profileId, deletedAt: null }, data: { documentId } });
  if (count === 0) throw new CarouselNotFound();
  return (await getCarousel(profileId, id))!;
}

/** Records the exported PDF (a StorageObject id and its public URL). Does not touch `revision`: a PDF isn't an edit. */
export async function setCarouselPdf(profileId: string, id: string, pdfStorageKey: string, pdfUrl: string | null): Promise<Carousel> {
  const { count } = await prisma.carousel.updateMany({ where: { id, profileId, deletedAt: null }, data: { pdfStorageKey, pdfUrl } });
  if (count === 0) throw new CarouselNotFound();
  return (await getCarousel(profileId, id))!;
}
