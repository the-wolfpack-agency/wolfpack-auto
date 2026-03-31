import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

/**
 * Dynamic PWA icon generator.
 * Usage: /api/icon?size=192 or /api/icon?size=512
 * Referenced by /public/manifest.json
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const size = parseInt(searchParams.get("size") ?? "512", 10);
  const validSize = [192, 512].includes(size) ? size : 512;
  const svgSize = Math.round(validSize * 0.6);
  const radius = Math.round(validSize * 0.12);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1e40af",
          borderRadius: `${radius}px`,
        }}
      >
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
    ),
    { width: validSize, height: validSize },
  );
}
