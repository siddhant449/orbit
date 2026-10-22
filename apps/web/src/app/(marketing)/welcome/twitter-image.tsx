import { ImageResponse } from "next/og";

// Placeholder share card (A14): plain type on ink until brand artwork exists. Listed in the O5 report.
export const alt = "Orbit: put your LinkedIn growth in orbit (placeholder card)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(700px 420px at 90% 100%, rgba(42,59,255,0.45), #0A0A0B 70%)",
          color: "#F5F4F0",
        }}
      >
        <div style={{ fontSize: 36, color: "#7C8AFF" }}>orbit</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, lineHeight: 0.95, letterSpacing: -4 }}>
          <span>Put your LinkedIn growth</span>
          <span style={{ color: "#7C8AFF" }}>in orbit.</span>
        </div>
      </div>
    ),
    size,
  );
}
