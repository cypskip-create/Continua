/**
 * Global text-size scale.
 * Base body size is 14px (Moomoo-equivalent); the scale multiplies it and is
 * persisted so it survives reloads and applies to every screen in the app.
 */
export const FONT_SCALES: Record<string, string> = {
  small: "0.9",
  default: "1",
  large: "1.1",
  xlarge: "1.2",
};

export const FONT_SCALE_KEY = "app_font_scale";

/** Apply a raw numeric scale (e.g. "1.1") and persist it. */
export function applyFontScale(scale: string) {
  const value = Object.values(FONT_SCALES).includes(scale) ? scale : "1";
  document.documentElement.style.setProperty("--app-font-scale", value);
  document.documentElement.style.fontSize = `${16 * Number(value)}px`;
  try { localStorage.setItem(FONT_SCALE_KEY, value); } catch {}
}

/** Apply a named size ("small" | "default" | "large" | "xlarge"). */
export function applyFontSizeName(name: string) {
  applyFontScale(FONT_SCALES[name] ?? "1");
}

/** Reverse lookup: current numeric scale → named size. */
export function fontSizeNameFromScale(scale: string): string {
  const found = Object.entries(FONT_SCALES).find(([, v]) => v === scale);
  return found ? found[0] : "default";
}

export function getFontScale(): string {
  try { return localStorage.getItem(FONT_SCALE_KEY) || "1"; } catch { return "1"; }
}
