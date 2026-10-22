import { cn } from "@brandloop/ui";

/** Gradient orbs Orbit uses when there's no photo (system §2.5, p12 rows); picked by name so a person keeps theirs. */
const GRADIENTS = [
  "radial-gradient(circle at 30% 30%, #E3E2DC, #5B5B5E)",
  "radial-gradient(circle at 30% 30%, #C9CEFF, #4F5FF5)",
  "radial-gradient(circle at 30% 30%, #FFF6D6, #8A8A8E)",
  "radial-gradient(circle at 30% 30%, #E8EBFF, #2A3BFF)",
  "radial-gradient(circle at 30% 30%, #F5F4F0, #9A9A9E)",
];

export function gradientFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length]!;
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, background: gradientFor(name) }}
    />
  );
}
