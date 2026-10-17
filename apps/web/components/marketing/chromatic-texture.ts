/**
 * Shared WebGL backdrop texture for the ChromaticImage surfaces.
 *
 * An inline SVG (no network): near-black with a faint engineering grid. Kept in
 * one place so the hero and the bento read as one continuous surface.
 */
const GRID = (step: number, count: number, horizontal: boolean): string =>
  Array.from({ length: count }, (_, i) =>
    horizontal
      ? `<line x1="0" y1="${i * step}" x2="1200" y2="${i * step}"/>`
      : `<line x1="${i * step}" y1="0" x2="${i * step}" y2="675"/>`,
  ).join("");

const DOTS = (step: number, nx: number, ny: number): string =>
  Array.from({ length: nx }, (_, x) =>
    Array.from(
      { length: ny },
      (_, y) => `<circle cx="${x * step}" cy="${y * step}" r="1.4"/>`,
    ).join(""),
  ).join("");

export const CHROMATIC_TEXTURE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` +
      `<rect width="1200" height="675" fill="#0a0a0b"/>` +
      `<g fill="none" stroke="#232327" stroke-width="1">${GRID(52, 24, false)}${GRID(52, 14, true)}</g>` +
      `<g fill="#3d3d44">${DOTS(52, 24, 14)}</g></svg>`,
  );

/**
 * Rich hero visual: grid + glow + faint code lines. Monochrome by design so the
 * chromatic warp reads as light-play, not color noise. Used as the ChromaticImage
 * source for the landing hero visual.
 */
export const HERO_TEXTURE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
      `<defs>` +
      `<radialGradient id="glow" cx="50%" cy="0%" r="75%">` +
      `<stop offset="0%" stop-color="#2a2a30" stop-opacity="0.9"/>` +
      `<stop offset="55%" stop-color="#131316" stop-opacity="0.45"/>` +
      `<stop offset="100%" stop-color="#0a0a0b" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="1600" height="900" fill="#0a0a0b"/>` +
      `<rect width="1600" height="900" fill="url(#glow)"/>` +
      `<g fill="none" stroke="#1d1d21" stroke-width="1">` +
      Array.from(
        { length: 32 },
        (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="900"/>`,
      ).join("") +
      Array.from(
        { length: 18 },
        (_, i) => `<line x1="0" y1="${i * 52}" x2="1600" y2="${i * 52}"/>`,
      ).join("") +
      `</g>` +
      `<g fill="#26262b">` +
      [
        [180, 560, 420, 10],
        [180, 590, 300, 10],
        [180, 620, 360, 10],
        [780, 560, 260, 10],
        [780, 590, 400, 10],
        [780, 620, 200, 10],
        [180, 680, 520, 10],
        [780, 680, 320, 10],
      ]
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`)
        .join("") +
      `</g>` +
      `<g fill="#3a3a41">` +
      [
        [180, 520, 14, 14],
        [780, 520, 14, 14],
      ]
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`)
        .join("") +
      `</g></svg>`,
  );
