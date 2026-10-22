"use client";

import type { ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";

/**
 * An integration action that is not built yet (screens.md B12): it looks like the real control so the page reads as
 * Orbit's layout, and pressing it says so plainly instead of pretending to connect anything.
 */
export function NotYetButton({
  service,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { service: string }) {
  return (
    <Button
      type="button"
      {...props}
      onClick={() => toast("Not available yet", { description: `${service} arrives in a later release.` })}
    >
      {children}
    </Button>
  );
}
