import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 512,
        height: 512,
        background: "#0A0A0F",
        borderRadius: 112,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Racket head outline */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 148,
          width: 216,
          height: 252,
          borderRadius: 108,
          border: "22px solid #DCFF1B",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "40px 20px",
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 22,
              height: 22,
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
          top: 296,
          left: 234,
          width: 44,
          height: 136,
          borderRadius: 22,
          background: "#0047FF",
          border: "4px solid #DCFF1B",
        }}
      />

      {/* Ball */}
      <div
        style={{
          position: "absolute",
          top: 52,
          right: 68,
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#0047FF",
          border: "7px solid #DCFF1B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    </div>,
    { ...size },
  );
}
