// Map a tag.color hex (or null) to the CSS variables we use on pills.
// All colors are tuned to read clearly on the app's neutral-950 bg.

export const DEFAULT_TAG_COLOR = "#10b981"; // emerald-500

export const TAG_COLOR_PRESETS: { name: string; value: string }[] = [
  { name: "emerald", value: "#10b981" },
  { name: "blue", value: "#3b82f6" },
  { name: "amber", value: "#f59e0b" },
  { name: "rose", value: "#f43f5e" },
  { name: "violet", value: "#8b5cf6" },
  { name: "cyan", value: "#06b6d4" },
  { name: "pink", value: "#ec4899" },
  { name: "slate", value: "#64748b" },
];

export function tagPillStyle(color: string | null | undefined): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const c = color || DEFAULT_TAG_COLOR;
  // Same hex with low alpha for bg; full saturation for text.
  return {
    backgroundColor: `${c}1a`, // ~10% alpha
    color: lightenForText(c),
    borderColor: `${c}33`,
  };
}

// For text we want a slightly lighter shade so it pops on the dark bg.
// Cheap shift: blend toward white by ~25%.
function lightenForText(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const mix = 0.25;
  r = Math.round(r + (255 - r) * mix);
  g = Math.round(g + (255 - g) * mix);
  b = Math.round(b + (255 - b) * mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
