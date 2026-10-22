import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { attachCarousel, CarouselConflict, CarouselNotFound, createCarousel, deleteCarousel, getCarousel, listCarousels, saveCarousel, setCarouselPdf } from "./carousels";
import { account, cleanupVisualTests, newDocument, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const content = { title: "Pricing", template: "ink", aspect: "4:5", options: { kit: "orbit", logo: false }, slides: [{ id: "a", title: "Hello", body: "World" }] };

describe("carousels", () => {
  it("creates, reads, lists and soft-deletes within the profile", async () => {
    const a = await account("c1");
    const b = await secondProfile(a);
    const c = await createCarousel(a.profileId, content);
    expect(c).toMatchObject({ title: "Pricing", version: 1, revision: 1, documentId: null });
    expect((await getCarousel(a.profileId, c.id))?.id).toBe(c.id);
    expect(await getCarousel(b.profileId, c.id)).toBeNull();
    expect(await listCarousels(a.profileId)).toMatchObject([{ id: c.id, slideCount: 1, firstSlide: "Hello World" }]);
    expect(await deleteCarousel(b.profileId, c.id)).toBe(false);
    expect(await deleteCarousel(a.profileId, c.id)).toBe(true);
    expect(await listCarousels(a.profileId)).toEqual([]);
  });

  it("save bumps revision and version, and a stale expectedRevision conflicts", async () => {
    const a = await account("c2");
    const c = await createCarousel(a.profileId, content);
    const saved = await saveCarousel(a.profileId, c.id, { ...content, title: "New" }, 1);
    expect(saved).toMatchObject({ title: "New", revision: 2, version: 2 });
    await expect(saveCarousel(a.profileId, c.id, content, 1)).rejects.toMatchObject({ currentRevision: 2 });
    await expect(saveCarousel(a.profileId, c.id, content, 1)).rejects.toBeInstanceOf(CarouselConflict);
    await expect(saveCarousel(a.profileId, "nope", content, 1)).rejects.toBeInstanceOf(CarouselNotFound);
  });

  it("attaches to the profile's own post only, and records a PDF without bumping revision", async () => {
    const a = await account("c3");
    const b = await secondProfile(a);
    const doc = await newDocument(a.profileId);
    const theirs = await newDocument(b.profileId);
    const c = await createCarousel(a.profileId, content);
    expect((await attachCarousel(a.profileId, c.id, doc.id)).documentId).toBe(doc.id);
    await expect(attachCarousel(a.profileId, c.id, theirs.id)).rejects.toBeInstanceOf(CarouselNotFound);
    await expect(createCarousel(a.profileId, { ...content, documentId: theirs.id })).rejects.toBeInstanceOf(CarouselNotFound);
    const withPdf = await setCarouselPdf(a.profileId, c.id, "obj1", "https://blob.example/x.pdf");
    expect(withPdf).toMatchObject({ pdfStorageKey: "obj1", pdfUrl: "https://blob.example/x.pdf", revision: 1 });
  });
});
