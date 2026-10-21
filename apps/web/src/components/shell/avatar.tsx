import { cn } from "@brandloop/ui";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Square print portrait on a pink plate (pink is the person); photos replace the initials. Decorative: the owning control names the person. */
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
        "grid size-7 shrink-0 place-items-center overflow-hidden rounded-control bg-pink type-micro text-on-pink before:content-[attr(data-initials)]",
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
