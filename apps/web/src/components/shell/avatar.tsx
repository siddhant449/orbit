import { cn } from "@brandloop/ui";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Profile avatar (system §2.5): the photo when there is one, otherwise Orbit's gradient orb
 * (`radial-gradient(circle at 30% 30%, #C9CEFF, #2A3BFF)`). Decorative; the owning control names the person.
 */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-name={name}
      className={cn(
        "block size-8 shrink-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_30%,#C9CEFF,#2A3BFF)]",
        className,
      )}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}
