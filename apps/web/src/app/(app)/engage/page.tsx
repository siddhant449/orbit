import { EngageScreen, type EngageTab } from "@/components/engage/engage-screen";

export const metadata = { title: "Engage" };

const TABS: EngageTab[] = ["queue", "leads", "lists"];

/*
 * Engage (screens.md B10, p12 / p25). The comment queue and leads inbox need LinkedIn ingestion that doesn't exist yet,
 * so every profile sees the not-connected state: Orbit's layout with empty states, a "Connect LinkedIn" pill, and the
 * "Draft a reply" tool, which works today through chat. No sample people or posts (ruling A14).
 */
export default async function EngagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = (await searchParams).view;
  const initialTab = TABS.find((t) => t === view) ?? "queue";
  return (
    <div className="w-full max-w-[1376px] px-5 pb-16 pt-8 md:px-8 md:pb-8 md:pt-[28px]">
      <EngageScreen snapshot={null} connected={false} now={new Date().toISOString()} initialTab={initialTab} />
    </div>
  );
}
