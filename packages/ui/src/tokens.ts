// FieldDay design tokens. Bold, sporty, high contrast: it must be readable
// in bright sunlight from 3 metres away. Colours match the art in /assets.

export const colors = {
  yellow: '#FFE600',
  green: '#2BD96B',
  navy: '#0B1C3D',
  navyDeep: '#06112A',
  navyLight: '#1A2F5C',
  coral: '#FF4D3D',
  white: '#FFFFFF',
  ink: '#0B1C3D',
} as const;

/** Every player gets a colour AND a shape AND a name, never colour alone. */
export const playerColors = [
  { name: 'Yellow', color: '#FFE600', shape: '●' },
  { name: 'Coral', color: '#FF4D3D', shape: '▲' },
  { name: 'Green', color: '#2BD96B', shape: '■' },
  { name: 'Sky', color: '#3DB8FF', shape: '◆' },
  { name: 'Pink', color: '#FF7AD9', shape: '★' },
  { name: 'Orange', color: '#FF9A1F', shape: '⬟' },
  { name: 'Violet', color: '#B58CFF', shape: '✚' },
  { name: 'White', color: '#FFFFFF', shape: '⬢' },
] as const;

export const size = {
  /** Smallest tap target. */
  touch: 56,
  radius: 18,
  gap: 16,
} as const;

export const font = {
  display: "'Archivo Black', 'Arial Black', system-ui, sans-serif",
  body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
