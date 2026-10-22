"use client";

import { Dithering } from "@paper-design/shaders-react";
import { useReducedMotionPref } from "@brandloop/ui";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ditherColors, ditherSpeed, supportsWebGL2 } from "./dither";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const noSubscribe = () => () => {};

/**
 * The dithered sphere: a lit planet whose light slowly circles it, Orbit's orb in the 4x4 Bayer register. Loaded only on
 * the client (see auth-shader.tsx). Without WebGL2 it paints the plain ground; under reduced motion or a hidden tab
 * the speed is 0, which stops the shader's animation frame loop.
 */
export default function DitherCanvas() {
  const { resolvedTheme } = useTheme();
  const reducedMotion = useReducedMotionPref();
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const webgl = useSyncExternalStore(noSubscribe, () => supportsWebGL2(document), () => false);

  if (!webgl) return <div data-shader="fallback" className="absolute inset-0 bg-ground" />;

  const speed = ditherSpeed({ reducedMotion, hidden });
  return (
    <Dithering
      data-shader="dithering"
      data-motion={speed === 0 ? "paused" : "running"}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%" }}
      {...ditherColors(resolvedTheme)}
      shape="sphere"
      type="4x4"
      size={2}
      scale={0.8}
      offsetX={0}
      offsetY={0.35}
      speed={speed}
      // A held frame with the light at the upper-left limb, so the paused sphere still reads as lit.
      frame={4200}
      minPixelRatio={1}
    />
  );
}
