import type { Metadata } from "next";
import { Chapters } from "@/components/marketing/chapters";
import { ComposerSheet } from "@/components/marketing/composer-sheet";
import { Faq } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { Journal } from "@/components/marketing/journal";
import { Loop } from "@/components/marketing/loop";
import { MobileMembers } from "@/components/marketing/mobile-members";
import { Nav } from "@/components/marketing/nav";
import { PageMotion } from "@/components/marketing/page-motion";
import { Pricing } from "@/components/marketing/pricing";
import { Proof } from "@/components/marketing/proof";
import { Sprint } from "@/components/marketing/sprint";
import { Team } from "@/components/marketing/team";

const DESCRIPTION =
  "Orbit turns what you already know into a weekly rhythm of posts, comments and conversations, so the right people find you before you need them.";

export const metadata: Metadata = {
  title: { absolute: "Orbit · Put your LinkedIn growth in orbit" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: "Orbit", description: DESCRIPTION, type: "website", siteName: "Orbit", url: "/" },
  twitter: { card: "summary_large_image", title: "Orbit", description: DESCRIPTION },
};

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ComposerSheet />
        <MobileMembers />
        <Loop />
        <Chapters />
        <Sprint />
        <Proof />
        <Journal />
        <Pricing />
        <Team />
        <Faq />
      </main>
      <Footer />
      <PageMotion />
    </>
  );
}
