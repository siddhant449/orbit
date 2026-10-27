/** ADMIN_EMAILS: the comma-separated allow-list of admin Clerk primary emails (case-insensitive). Unset or empty: nobody. */
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const e = email?.trim().toLowerCase();
  return Boolean(e) && adminEmails(env).includes(e!);
}

