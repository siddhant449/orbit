import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Never cached or prerendered: every request re-checks the allow-list, and anyone not on it gets the 404 page.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <main className="min-h-dvh w-full bg-ground text-text">{children}</main>;
}
