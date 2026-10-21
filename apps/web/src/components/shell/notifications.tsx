"use client";

import { Popover } from "radix-ui";
import { pillSmClass } from "./top-bar";

/**
 * Notifications (system §6.11): the top-bar pill and a 360 px panel. There is no notifications feature yet (O14), so
 * the pill carries no count and the panel says so plainly.
 */
export function Notifications() {
  return (
    <Popover.Root>
      <Popover.Trigger className={pillSmClass}>Notifications</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="orbit-panel z-50 w-[min(360px,calc(100vw-32px))] !shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          <h2 className="text-[14px] font-medium text-text">Notifications</h2>
          <p className="mt-6 pb-4 text-center text-[13px] text-text-2">Nothing new</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
