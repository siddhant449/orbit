import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { adminEmails, isAdminEmail } from "@/lib/admin-email";
import { isMockMode } from "@/lib/chat-deps";

/**
 * Admin access. A page, action or route under /admin is available only to a signed-in user whose Clerk PRIMARY email
 * (verified) is listed in ADMIN_EMAILS (comma-separated, case-insensitive). Everyone else, signed in or not, gets a
 * plain 404 (`notFound()`), never a "forbidden" page. With ADMIN_EMAILS unset or empty nobody is an admin.
 */
/** Cookie the e2e suite sets to act as an admin. Honoured only by the offline mock server (AI_MOCK_MODEL=1, never in production). */
export const E2E_ADMIN_COOKIE = "orbit-e2e-admin";

export type Admin = { clerkId: string; email: string };

/** The signed-in admin, or null. Never redirects and never throws. */
export async function currentAdmin(env: Record<string, string | undefined> = process.env): Promise<Admin | null> {
  const { userId } = await auth();
  if (!userId) return null;
  if (isMockMode(env) && (await cookies()).get(E2E_ADMIN_COOKIE)?.value === "1") return { clerkId: userId, email: "e2e-admin" };
  if (adminEmails(env).length === 0) return null;
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") return null;
  return isAdminEmail(primary.emailAddress, env) ? { clerkId: userId, email: primary.emailAddress } : null;
}

/** For every admin page, action and route: the admin, or a 404. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}
