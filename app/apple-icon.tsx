import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        background: "#0A0A0F",
        borderRadius: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Racket head */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 48,
          width: 84,
          height: 96,
          borderRadius: 42,
          border: "8px solid #DCFF1B",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "14px 8px",
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#DCFF1B",
              opacity: 0.75,
            }}
          />
        ))}
      </div>

      {/* Handle */}
      <div
        style={{
          position: "absolute",
          top: 106,
          left: 82,
          width: 16,
          height: 50,
          borderRadius: 8,
          background: "#0047FF",
          border: "2px solid #DCFF1B",
        }}
      />

      {/* Ball */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 22,
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#0047FF",
          border: "3px solid #DCFF1B",
        }}
      />
    </div>,
    { ...size },
  );
}
