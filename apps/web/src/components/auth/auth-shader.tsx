"use client";

import dynamic from "next/dynamic";

/** Client-only and split out of the page bundle, so the form paints first; the ground shows until it mounts. */
const DitherCanvas = dynamic(() => import("./dither-canvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ground" />,
});

export function AuthShader({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-testid="auth-shader" className={className} style={{ pointerEvents: "none" }}>
      <DitherCanvas />
    </div>
  );
}
