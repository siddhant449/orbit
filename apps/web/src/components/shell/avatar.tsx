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
 * Graphite line monogram: a hairline frame with the initials drawn in ink; photos replace the initials. Decorative,
 * the owning control names the person; the initials are CSS-generated so they are not visible text for that control.
 */
export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-initials={src ? undefined : initials(name)}
      className={cn(
        "grid size-7 shrink-0 place-items-center overflow-hidden rounded-control border border-keyline bg-surface type-micro text-ink before:content-[attr(data-initials)]",
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
