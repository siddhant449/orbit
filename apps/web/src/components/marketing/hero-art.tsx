/**
 * Hero background (system §8, ruling A19/A20): Orbit's own SVG turbulence orb, rendered on the server.
 * Choice: SVG over a WebGL shader. It ships zero JS and no extra dependency, paints in the first frame at its final
 * size (no layout shift), and every loop is a CSS animation the HeroMotion island can
 * pause off-screen / in a hidden tab. The only SMIL animation (turbulence frequency) starts with begin="indefinite",
 * so it never runs under reduced motion or without JS; reduced motion leaves a static frame.
 */

const RINGS: ReadonlyArray<readonly [number, string, number]> = [
  [330, "#F5F4F0", 26],
  [296, "#2A3BFF", 22],
  [262, "#0A0A0B", 28],
  [228, "#C9CEFF", 22],
  [194, "#1A1A1E", 26],
  [160, "#F5F4F0", 20],
  [128, "#2A3BFF", 22],
  [96, "#0A0A0B", 22],
  [64, "#7C8AFF", 16],
];

export function Orb() {
  return (
    <div className="orb" aria-hidden="true" data-orb>
      <div className="orb__float">
        <svg viewBox="0 0 600 600">
          <defs>
            <clipPath id="orbclip">
              <circle cx="300" cy="300" r="268" />
            </clipPath>
            <filter id="liquid" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves={3} seed={9} result="noise">
                <animate
                  data-orb-flow
                  attributeName="baseFrequency"
                  values="0.009;0.016;0.009"
                  dur="16s"
                  begin="indefinite"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={110} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <radialGradient id="sheen" cx="32%" cy="26%" r="70%">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.1" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
            </radialGradient>
            <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F5F4F0" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#F5F4F0" stopOpacity="0" />
              <stop offset="1" stopColor="#2A3BFF" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <g clipPath="url(#orbclip)">
            <rect width="600" height="600" fill="#0A0A0B" />
            <g filter="url(#liquid)">
              <g className="spin">
                {RINGS.map(([r, c, w]) => (
                  <circle key={r} cx="300" cy="300" r={r} fill="none" stroke={c} strokeWidth={w} />
                ))}
                <circle cx="300" cy="300" r="34" fill="#F5F4F0" />
              </g>
            </g>
            <circle cx="300" cy="300" r="268" fill="url(#sheen)" />
          </g>
          <circle cx="300" cy="300" r="267" fill="none" stroke="url(#rim)" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}
