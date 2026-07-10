export const LOC_PREFIX = "LOC:";

export interface ParsedContent {
  text: string;
  location: { lat: number; lon: number } | null;
}

export function parseMessageContent(content: string): ParsedContent {
  const match = content.match(/LOC:(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!match) return { text: content, location: null };
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  const text = content.replace(match[0], "").trim();
  return { text, location: Number.isNaN(lat) || Number.isNaN(lon) ? null : { lat, lon } };
}