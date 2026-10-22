import Link from "next/link";
import { buttonVariants, cn } from "@brandloop/ui";

export const INTEGRATIONS_HREF = "/settings/integrations";

/** The primary "Connect LinkedIn" pill: LinkedIn connects in Settings → Integrations (screens.md B12). */
export function ConnectLinkedIn({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={INTEGRATIONS_HREF} className={cn(buttonVariants({ variant: "primary", size }), className)}>
      Connect LinkedIn
    </Link>
  );
}

/** Status line under the page title (p09): a 7 px dot, then the connection state in `13px text-2`. */
export function ConnectionStatus({ connected, children }: { connected: boolean; children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-2.5 text-[13px] text-text-2">
      <span
        aria-hidden="true"
        className={cn("block size-[7px] shrink-0 rounded-full", connected ? "bg-accent-text" : "border border-text-3")}
      />
      {children}
    </p>
  );
}
