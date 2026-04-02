/**
 * System Backgrounds — High-Quality Built-In Vehicle Photo Backgrounds
 *
 * Ships 6 photorealistic backgrounds that every dealer gets out of the box.
 * Generated server-side via Sharp (SVG compositing with gradients, noise,
 * lighting effects, floor reflections, and vignettes).
 *
 * These cover 95%+ of real dealer use cases:
 *  1. White Studio     — the CarGurus/Carvana clean look
 *  2. Dark Studio      — premium, luxury feel with rim lighting
 *  3. Showroom Floor   — polished dealership interior, ceiling lights
 *  4. Outdoor Lot      — clean asphalt, sky, natural lighting
 *  5. Lifestyle Drive   — blurred scenic road, hero shot feel
 *  6. Branded Gradient  — dealer's brand colors, professional gradient
 *
 * Architecture:
 *  - Backgrounds are generated on demand via Sharp (no external API needed)
 *  - Seed script generates all 6 and uploads to R2 as system backgrounds
 *  - Marked is_system=true in DB, available to every dealer
 *  - Analytics tracks which system backgrounds perform best
 */

import sharp from "sharp";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SystemBackgroundDef {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** Function that generates the background image buffer */
  generate: (width: number, height: number) => Promise<Buffer>;
}

export interface GeneratedBackground {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

/* ------------------------------------------------------------------ */
/*  SVG building helpers                                               */
/* ------------------------------------------------------------------ */

function svgHeader(w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
}

function linearGradient(
  id: string,
  stops: { offset: string; color: string; opacity?: number }[],
  angle = 90,
): string {
  // Convert angle to x1,y1,x2,y2
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = Math.round(50 + 50 * Math.cos(rad + Math.PI));
  const y1 = Math.round(50 + 50 * Math.sin(rad + Math.PI));
  const x2 = Math.round(50 + 50 * Math.cos(rad));
  const y2 = Math.round(50 + 50 * Math.sin(rad));

  const stopsStr = stops
    .map(
      (s) =>
        `<stop offset="${s.offset}" style="stop-color:${s.color};stop-opacity:${s.opacity ?? 1}" />`,
    )
    .join("\n      ");

  return `
    <defs>
      <linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
        ${stopsStr}
      </linearGradient>
    </defs>`;
}

function radialGradient(
  id: string,
  cx: string,
  cy: string,
  r: string,
  stops: { offset: string; color: string; opacity?: number }[],
): string {
  const stopsStr = stops
    .map(
      (s) =>
        `<stop offset="${s.offset}" style="stop-color:${s.color};stop-opacity:${s.opacity ?? 1}" />`,
    )
    .join("\n      ");

  return `
    <defs>
      <radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="objectBoundingBox">
        ${stopsStr}
      </radialGradient>
    </defs>`;
}

function rect(w: number, h: number, fill: string, extraAttrs = ""): string {
  return `<rect width="${w}" height="${h}" fill="${fill}" ${extraAttrs}/>`;
}

/* ------------------------------------------------------------------ */
/*  Noise texture overlay (adds realism to flat gradients)             */
/* ------------------------------------------------------------------ */

function noiseFilter(id: string, baseFrequency = 0.65, opacity = 0.03): string {
  return `
    <defs>
      <filter id="${id}">
        <feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="4" stitchTiles="stitch" result="noise" />
        <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
      </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#${id})" opacity="${opacity}" />`;
}

/* ------------------------------------------------------------------ */
/*  Vignette overlay                                                   */
/* ------------------------------------------------------------------ */

function vignette(w: number, h: number, opacity = 0.3): string {
  return `
    <defs>
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%" style="stop-color:black;stop-opacity:0" />
        <stop offset="100%" style="stop-color:black;stop-opacity:${opacity}" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#vignette)" />`;
}

/* ------------------------------------------------------------------ */
/*  1. White Studio                                                    */
/* ------------------------------------------------------------------ */

async function generateWhiteStudio(w: number, h: number): Promise<Buffer> {
  const floorY = Math.round(h * 0.62);

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Wall gradient -->
    ${linearGradient("wall", [
      { offset: "0%", color: "#fafafa" },
      { offset: "60%", color: "#f0f0f0" },
      { offset: "100%", color: "#e8e8e8" },
    ], 180)}
    ${rect(w, h, "url(#wall)")}

    <!-- Floor with subtle reflection -->
    ${linearGradient("floor", [
      { offset: "0%", color: "#e0e0e0" },
      { offset: "30%", color: "#d8d8d8" },
      { offset: "100%", color: "#cccccc" },
    ], 180)}
    <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="url(#floor)" />

    <!-- Floor horizon line -->
    <line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" stroke="#d0d0d0" stroke-width="1" opacity="0.5" />

    <!-- Soft overhead light glow -->
    ${radialGradient("topLight", "50%", "0%", "60%", [
      { offset: "0%", color: "#ffffff", opacity: 0.4 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#topLight)")}

    <!-- Floor reflection glow (where car would sit) -->
    ${radialGradient("floorGlow", "50%", "75%", "35%", [
      { offset: "0%", color: "#ffffff", opacity: 0.15 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#floorGlow)")}

    <!-- Subtle noise for texture -->
    ${noiseFilter("noise", 0.7, 0.02)}

    <!-- Soft vignette -->
    ${vignette(w, h, 0.08)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  2. Dark Studio                                                     */
/* ------------------------------------------------------------------ */

async function generateDarkStudio(w: number, h: number): Promise<Buffer> {
  const floorY = Math.round(h * 0.6);

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Dark wall -->
    ${linearGradient("darkWall", [
      { offset: "0%", color: "#0a0a14" },
      { offset: "50%", color: "#0f1022" },
      { offset: "100%", color: "#141428" },
    ], 180)}
    ${rect(w, h, "url(#darkWall)")}

    <!-- Reflective dark floor -->
    ${linearGradient("darkFloor", [
      { offset: "0%", color: "#0d0d1a" },
      { offset: "100%", color: "#080812" },
    ], 180)}
    <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="url(#darkFloor)" />

    <!-- Floor horizon line (subtle) -->
    <line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" stroke="#1a1a33" stroke-width="1" opacity="0.6" />

    <!-- Rim light from left -->
    ${radialGradient("rimLeft", "0%", "40%", "45%", [
      { offset: "0%", color: "#3366cc", opacity: 0.08 },
      { offset: "100%", color: "#3366cc", opacity: 0 },
    ])}
    ${rect(w, h, "url(#rimLeft)")}

    <!-- Rim light from right -->
    ${radialGradient("rimRight", "100%", "40%", "45%", [
      { offset: "0%", color: "#6633cc", opacity: 0.06 },
      { offset: "100%", color: "#6633cc", opacity: 0 },
    ])}
    ${rect(w, h, "url(#rimRight)")}

    <!-- Overhead key light -->
    ${radialGradient("keyLight", "50%", "0%", "50%", [
      { offset: "0%", color: "#ffffff", opacity: 0.06 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#keyLight)")}

    <!-- Floor reflection pool -->
    ${radialGradient("reflPool", "50%", "80%", "30%", [
      { offset: "0%", color: "#ffffff", opacity: 0.04 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#reflPool)")}

    <!-- Noise -->
    ${noiseFilter("darkNoise", 0.5, 0.04)}

    <!-- Heavy vignette -->
    ${vignette(w, h, 0.5)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  3. Showroom Floor                                                  */
/* ------------------------------------------------------------------ */

async function generateShowroom(w: number, h: number): Promise<Buffer> {
  const floorY = Math.round(h * 0.55);
  const ceilHeight = Math.round(h * 0.08);

  // Generate ceiling light spots
  const lightCount = 5;
  const lightSpacing = w / (lightCount + 1);
  let lights = "";
  for (let i = 1; i <= lightCount; i++) {
    const cx = Math.round(lightSpacing * i);
    lights += `
      <defs>
        <radialGradient id="cLight${i}" cx="${cx}" cy="${ceilHeight}" r="${Math.round(w * 0.12)}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.25" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#cLight${i})" />`;
  }

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Showroom wall -->
    ${linearGradient("srWall", [
      { offset: "0%", color: "#e8e4df" },
      { offset: "40%", color: "#e0dbd5" },
      { offset: "100%", color: "#d5d0c8" },
    ], 180)}
    ${rect(w, h, "url(#srWall)")}

    <!-- Ceiling strip -->
    ${linearGradient("ceiling", [
      { offset: "0%", color: "#f5f3f0" },
      { offset: "100%", color: "#eae6e0" },
    ], 180)}
    <rect x="0" y="0" width="${w}" height="${ceilHeight}" fill="url(#ceiling)" />

    <!-- Polished floor -->
    ${linearGradient("srFloor", [
      { offset: "0%", color: "#c8c0b5" },
      { offset: "40%", color: "#bfb7ab" },
      { offset: "100%", color: "#b5ada0" },
    ], 180)}
    <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="url(#srFloor)" />

    <!-- Floor horizon -->
    <line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" stroke="#c0b8ac" stroke-width="2" opacity="0.4" />

    <!-- Glass wall hint (right side) -->
    <rect x="${Math.round(w * 0.85)}" y="0" width="${Math.round(w * 0.15)}" height="${floorY}" fill="#d0e8f0" opacity="0.08" />

    <!-- Ceiling lights -->
    ${lights}

    <!-- Floor reflection of lights -->
    ${radialGradient("floorRefl", "50%", "70%", "40%", [
      { offset: "0%", color: "#ffffff", opacity: 0.06 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#floorRefl)")}

    <!-- Warm tone overlay -->
    <rect width="${w}" height="${h}" fill="#f5e6d0" opacity="0.04" />

    ${noiseFilter("srNoise", 0.6, 0.025)}
    ${vignette(w, h, 0.12)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  4. Outdoor Lot                                                     */
/* ------------------------------------------------------------------ */

async function generateOutdoorLot(w: number, h: number): Promise<Buffer> {
  const horizonY = Math.round(h * 0.42);
  const asphaltY = Math.round(h * 0.52);

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Sky gradient -->
    ${linearGradient("sky", [
      { offset: "0%", color: "#4a90d9" },
      { offset: "40%", color: "#6ba3e0" },
      { offset: "70%", color: "#8cb8e8" },
      { offset: "100%", color: "#b5d4f0" },
    ], 180)}
    ${rect(w, h, "url(#sky)")}

    <!-- Distant tree line / horizon -->
    ${linearGradient("treeLine", [
      { offset: "0%", color: "#4a7c59", opacity: 0.7 },
      { offset: "100%", color: "#5a8c68", opacity: 0.3 },
    ], 180)}
    <rect x="0" y="${horizonY}" width="${w}" height="${Math.round(h * 0.12)}" fill="url(#treeLine)" />

    <!-- Asphalt -->
    ${linearGradient("asphalt", [
      { offset: "0%", color: "#606060" },
      { offset: "30%", color: "#555555" },
      { offset: "100%", color: "#4a4a4a" },
    ], 180)}
    <rect x="0" y="${asphaltY}" width="${w}" height="${h - asphaltY}" fill="url(#asphalt)" />

    <!-- Asphalt texture hints -->
    ${noiseFilter("asphaltNoise", 1.2, 0.06)}

    <!-- Sun glow (upper left) -->
    ${radialGradient("sun", "30%", "10%", "35%", [
      { offset: "0%", color: "#fffde0", opacity: 0.3 },
      { offset: "50%", color: "#fff8c0", opacity: 0.1 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#sun)")}

    <!-- Warm sunlight wash -->
    <rect width="${w}" height="${h}" fill="#ffeedd" opacity="0.04" />

    <!-- Parking line hint (subtle) -->
    <rect x="${Math.round(w * 0.35)}" y="${Math.round(h * 0.92)}" width="${Math.round(w * 0.002)}" height="${Math.round(h * 0.08)}" fill="#888888" opacity="0.2" />
    <rect x="${Math.round(w * 0.65)}" y="${Math.round(h * 0.92)}" width="${Math.round(w * 0.002)}" height="${Math.round(h * 0.08)}" fill="#888888" opacity="0.2" />

    ${vignette(w, h, 0.15)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  5. Lifestyle Drive                                                 */
/* ------------------------------------------------------------------ */

async function generateLifestyleDrive(w: number, h: number): Promise<Buffer> {
  const roadY = Math.round(h * 0.55);

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Blurred mountain/sky -->
    ${linearGradient("lsSky", [
      { offset: "0%", color: "#5e7fa0" },
      { offset: "25%", color: "#7a9ab8" },
      { offset: "50%", color: "#a0b8cc" },
      { offset: "70%", color: "#8aaa80" },
      { offset: "100%", color: "#607858" },
    ], 180)}
    ${rect(w, h, "url(#lsSky)")}

    <!-- Road surface -->
    ${linearGradient("road", [
      { offset: "0%", color: "#505050" },
      { offset: "50%", color: "#484848" },
      { offset: "100%", color: "#404040" },
    ], 180)}
    <rect x="0" y="${roadY}" width="${w}" height="${h - roadY}" fill="url(#road)" />

    <!-- Road center line -->
    <line x1="${Math.round(w * 0.3)}" y1="${roadY + 2}" x2="${Math.round(w * 0.5)}" y2="${h}"
      stroke="#cccc66" stroke-width="2" opacity="0.15" />

    <!-- Atmospheric haze -->
    ${radialGradient("haze", "50%", "45%", "50%", [
      { offset: "0%", color: "#c0d0e0", opacity: 0.15 },
      { offset: "100%", color: "#c0d0e0", opacity: 0 },
    ])}
    ${rect(w, h, "url(#haze)")}

    <!-- Golden hour warm light from left -->
    ${radialGradient("golden", "15%", "35%", "40%", [
      { offset: "0%", color: "#ffcc66", opacity: 0.12 },
      { offset: "100%", color: "#ffcc66", opacity: 0 },
    ])}
    ${rect(w, h, "url(#golden)")}

    <!-- Depth of field blur simulation (soft noise) -->
    ${noiseFilter("dofNoise", 0.3, 0.03)}

    <!-- Cinematic vignette -->
    ${vignette(w, h, 0.25)}

    <!-- Slight desaturation overlay for dreamy feel -->
    <rect width="${w}" height="${h}" fill="#e0e8f0" opacity="0.05" />
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  6. Branded Gradient                                                */
/* ------------------------------------------------------------------ */

async function generateBrandedGradient(
  w: number,
  h: number,
  primaryColor = "#1e40af",
  secondaryColor = "#7c3aed",
): Promise<Buffer> {
  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Primary gradient -->
    ${linearGradient("brand", [
      { offset: "0%", color: primaryColor },
      { offset: "60%", color: secondaryColor },
      { offset: "100%", color: "#0f172a" },
    ], 135)}
    ${rect(w, h, "url(#brand)")}

    <!-- Soft light orb (upper right) -->
    ${radialGradient("orb1", "75%", "20%", "35%", [
      { offset: "0%", color: "#ffffff", opacity: 0.08 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#orb1)")}

    <!-- Soft light orb (lower left) -->
    ${radialGradient("orb2", "25%", "80%", "30%", [
      { offset: "0%", color: primaryColor, opacity: 0.15 },
      { offset: "100%", color: primaryColor, opacity: 0 },
    ])}
    ${rect(w, h, "url(#orb2)")}

    <!-- Floor reflection zone -->
    ${linearGradient("brandFloor", [
      { offset: "0%", color: "#000000", opacity: 0 },
      { offset: "100%", color: "#000000", opacity: 0.2 },
    ], 180)}
    <rect x="0" y="${Math.round(h * 0.6)}" width="${w}" height="${Math.round(h * 0.4)}" fill="url(#brandFloor)" />

    ${noiseFilter("brandNoise", 0.4, 0.03)}
    ${vignette(w, h, 0.2)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  7. Premium Dealership Interior                                     */
/* ------------------------------------------------------------------ */

async function generatePremiumDealership(w: number, h: number): Promise<Buffer> {
  const floorY = Math.round(h * 0.52);
  const ceilH = Math.round(h * 0.06);
  const wallBase = "#e6e2dc";

  // Generate recessed LED ceiling panel strips
  const panelCount = 7;
  const panelW = Math.round(w * 0.08);
  const panelSpacing = w / (panelCount + 1);
  let ceilingPanels = "";
  for (let i = 1; i <= panelCount; i++) {
    const cx = Math.round(panelSpacing * i);
    const px = cx - Math.round(panelW / 2);
    // Recessed panel
    ceilingPanels += `
      <rect x="${px}" y="0" width="${panelW}" height="${ceilH}" rx="2" fill="#f8f6f2" opacity="0.9" />
      <rect x="${px + 2}" y="2" width="${panelW - 4}" height="${ceilH - 4}" rx="1" fill="#fffef8" opacity="0.95" />`;
    // Light cone down from panel
    ceilingPanels += `
      <defs>
        <radialGradient id="cone${i}" cx="${cx}" cy="${ceilH}" r="${Math.round(w * 0.09)}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.18" />
          <stop offset="60%" style="stop-color:#ffffff;stop-opacity:0.04" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#cone${i})" />`;
    // Floor reflection of each light
    ceilingPanels += `
      <defs>
        <radialGradient id="flRef${i}" cx="${cx}" cy="${Math.round(h * 0.75)}" r="${Math.round(w * 0.06)}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.07" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
        </radialGradient>
      </defs>
      <ellipse cx="${cx}" cy="${Math.round(h * 0.78)}" rx="${Math.round(w * 0.04)}" ry="${Math.round(h * 0.02)}" fill="url(#flRef${i})" />`;
  }

  // Glass curtain wall columns (right side, perspective)
  const colCount = 4;
  let glassCols = "";
  for (let i = 0; i < colCount; i++) {
    const xBase = Math.round(w * 0.78 + i * w * 0.06);
    const colW = Math.round(w * 0.003);
    glassCols += `
      <rect x="${xBase}" y="${ceilH}" width="${colW}" height="${floorY - ceilH}" fill="#b8b0a8" opacity="0.25" />`;
  }
  // Glass fill between columns
  glassCols += `
    <rect x="${Math.round(w * 0.78)}" y="${ceilH}" width="${Math.round(w * 0.22)}" height="${floorY - ceilH}" fill="#c8dce8" opacity="0.06" />`;
  // Daylight glow through glass
  glassCols += `
    <defs>
      <radialGradient id="daylight" cx="95%" cy="30%" r="30%" gradientUnits="objectBoundingBox">
        <stop offset="0%" style="stop-color:#e8f0ff;stop-opacity:0.12" />
        <stop offset="100%" style="stop-color:#e8f0ff;stop-opacity:0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#daylight)" />`;

  // Perspective floor grid lines (converging to vanishing point)
  const vpX = Math.round(w * 0.48);
  const vpY = Math.round(h * 0.44);
  let floorGrid = "";
  // Horizontal lines (receding)
  for (let i = 1; i <= 8; i++) {
    const y = floorY + Math.round((h - floorY) * (i / 8) * (i / 8)); // quadratic spacing
    const opacity = 0.04 + (i / 8) * 0.04;
    floorGrid += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#a8a098" stroke-width="0.5" opacity="${opacity}" />`;
  }
  // Converging lines from bottom corners to vanishing point
  for (let i = 0; i <= 10; i++) {
    const bx = Math.round((w / 10) * i);
    floorGrid += `<line x1="${bx}" y1="${h}" x2="${vpX}" y2="${vpY}" stroke="#a8a098" stroke-width="0.3" opacity="0.03" />`;
  }

  // Brand accent wall (left side, subtle color stripe)
  const accentW = Math.round(w * 0.004);

  const svg = Buffer.from(`${svgHeader(w, h)}
    <!-- Ceiling -->
    ${linearGradient("pdCeil", [
      { offset: "0%", color: "#f0ede8" },
      { offset: "100%", color: "#eae6e0" },
    ], 180)}
    <rect x="0" y="0" width="${w}" height="${ceilH}" fill="url(#pdCeil)" />

    <!-- Upper wall -->
    ${linearGradient("pdWall", [
      { offset: "0%", color: "#eae6e0" },
      { offset: "30%", color: "${wallBase}" },
      { offset: "100%", color: "#ddd8d0" },
    ], 180)}
    <rect x="0" y="${ceilH}" width="${w}" height="${floorY - ceilH}" fill="url(#pdWall)" />

    <!-- Polished epoxy floor -->
    ${linearGradient("pdFloor", [
      { offset: "0%", color: "#ccc5bb" },
      { offset: "15%", color: "#c4bdb2" },
      { offset: "50%", color: "#bbb4a8" },
      { offset: "100%", color: "#b0a898" },
    ], 180)}
    <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="url(#pdFloor)" />

    <!-- Floor horizon line (the key visual cue) -->
    <line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" stroke="#c8c0b5" stroke-width="1.5" opacity="0.5" />
    <!-- Secondary horizon glow -->
    ${linearGradient("horizGlow", [
      { offset: "0%", color: "#ffffff", opacity: 0.08 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ], 180)}
    <rect x="0" y="${floorY - 3}" width="${w}" height="6" fill="url(#horizGlow)" />

    <!-- Floor perspective grid -->
    ${floorGrid}

    <!-- Glass curtain wall (right) -->
    ${glassCols}

    <!-- Brand accent stripe (left wall) -->
    <rect x="${Math.round(w * 0.04)}" y="${ceilH}" width="${accentW}" height="${floorY - ceilH}" fill="#2563eb" opacity="0.2" />
    <rect x="${Math.round(w * 0.04) + accentW + 3}" y="${ceilH}" width="${accentW}" height="${floorY - ceilH}" fill="#1e40af" opacity="0.1" />

    <!-- Recessed LED ceiling panels + light cones -->
    ${ceilingPanels}

    <!-- Central floor highlight (where car sits) -->
    ${radialGradient("carSpot", "50%", "72%", "25%", [
      { offset: "0%", color: "#ffffff", opacity: 0.1 },
      { offset: "50%", color: "#ffffff", opacity: 0.03 },
      { offset: "100%", color: "#ffffff", opacity: 0 },
    ])}
    ${rect(w, h, "url(#carSpot)")}

    <!-- Overall ambient warmth -->
    <rect width="${w}" height="${h}" fill="#f5e8d0" opacity="0.025" />

    <!-- Subtle noise for floor texture realism -->
    ${noiseFilter("pdNoise", 0.8, 0.02)}

    <!-- Professional vignette -->
    ${vignette(w, h, 0.15)}
  </svg>`);

  return sharp(svg).png({ quality: 95 }).toBuffer();
}

/* ------------------------------------------------------------------ */
/*  System background definitions                                      */
/* ------------------------------------------------------------------ */

export const SYSTEM_BACKGROUNDS: SystemBackgroundDef[] = [
  {
    id: "system_dealership",
    name: "Modern Dealership",
    description: "Premium dealership interior with polished epoxy floor, recessed LED panels, glass curtain walls, and perspective depth. The flagship background.",
    category: "studio",
    tags: ["dealership", "showroom", "premium", "modern", "flagship", "popular"],
    generate: generatePremiumDealership,
  },
  {
    id: "system_white_studio",
    name: "White Studio",
    description: "Clean white studio with soft lighting and polished floor. The industry standard for professional vehicle photos.",
    category: "studio",
    tags: ["clean", "professional", "universal", "carvana-style"],
    generate: generateWhiteStudio,
  },
  {
    id: "system_dark_studio",
    name: "Dark Studio",
    description: "Premium dark studio with dramatic rim lighting. Perfect for luxury and performance vehicles.",
    category: "studio",
    tags: ["luxury", "premium", "dramatic", "dark"],
    generate: generateDarkStudio,
  },
  {
    id: "system_showroom",
    name: "Dealership Showroom",
    description: "Polished showroom floor with overhead lighting and warm tones. Looks like a real dealership interior.",
    category: "studio",
    tags: ["showroom", "dealership", "interior", "professional"],
    generate: generateShowroom,
  },
  {
    id: "system_outdoor_lot",
    name: "Outdoor Lot",
    description: "Clean outdoor setting with blue sky, distant tree line, and asphalt. The classic dealer lot photo look.",
    category: "outdoor",
    tags: ["outdoor", "lot", "natural", "sky"],
    generate: generateOutdoorLot,
  },
  {
    id: "system_lifestyle",
    name: "Lifestyle Drive",
    description: "Scenic road with mountains and golden-hour lighting. Great for hero shots and featured vehicles.",
    category: "lifestyle",
    tags: ["scenic", "road", "hero", "lifestyle", "golden-hour"],
    generate: generateLifestyleDrive,
  },
  {
    id: "system_branded",
    name: "Branded Gradient",
    description: "Professional gradient using your dealership brand colors. Auto-adapts to your color scheme.",
    category: "branded",
    tags: ["branded", "gradient", "custom", "professional"],
    generate: generateBrandedGradient,
  },
];

/* ------------------------------------------------------------------ */
/*  Generation API                                                     */
/* ------------------------------------------------------------------ */

/**
 * Generate all system backgrounds at the specified resolution.
 * Default: 1920x1080 (Full HD, optimal for web display).
 */
export async function generateAllSystemBackgrounds(
  width = 1920,
  height = 1080,
): Promise<GeneratedBackground[]> {
  const results: GeneratedBackground[] = [];

  for (const def of SYSTEM_BACKGROUNDS) {
    const buffer = await def.generate(width, height);
    const metadata = await sharp(buffer).metadata();

    results.push({
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      tags: def.tags,
      buffer,
      width: metadata.width ?? width,
      height: metadata.height ?? height,
      size: buffer.length,
    });
  }

  return results;
}

/**
 * Generate a single system background by ID.
 */
export async function generateSystemBackground(
  id: string,
  width = 1920,
  height = 1080,
  options?: { primaryColor?: string; secondaryColor?: string },
): Promise<GeneratedBackground | null> {
  const def = SYSTEM_BACKGROUNDS.find((b) => b.id === id);
  if (!def) return null;

  let buffer: Buffer;
  if (id === "system_branded" && (options?.primaryColor || options?.secondaryColor)) {
    buffer = await generateBrandedGradient(
      width,
      height,
      options.primaryColor,
      options.secondaryColor,
    );
  } else {
    buffer = await def.generate(width, height);
  }

  const metadata = await sharp(buffer).metadata();

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    tags: def.tags,
    buffer,
    width: metadata.width ?? width,
    height: metadata.height ?? height,
    size: buffer.length,
  };
}

/**
 * Generate optimized variants (WebP + thumbnail) for a system background.
 */
export async function generateOptimizedVariants(
  buffer: Buffer,
): Promise<{ optimized: Buffer; thumbnail: Buffer; optimizedSize: number; thumbnailSize: number }> {
  const [optimized, thumbnail] = await Promise.all([
    sharp(buffer).webp({ quality: 90 }).toBuffer(),
    sharp(buffer).resize(480, 270, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
  ]);

  return {
    optimized,
    thumbnail,
    optimizedSize: optimized.length,
    thumbnailSize: thumbnail.length,
  };
}

/**
 * Get the list of system background IDs for checking existence.
 */
export function getSystemBackgroundIds(): string[] {
  return SYSTEM_BACKGROUNDS.map((b) => b.id);
}

/**
 * Get system background metadata (without generating the image).
 */
export function getSystemBackgroundMeta(): Omit<SystemBackgroundDef, "generate">[] {
  return SYSTEM_BACKGROUNDS.map(({ generate: _, ...rest }) => rest);
}
