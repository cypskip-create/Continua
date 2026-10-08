/**
 * Global text-size scale.
 * Scale the root rem unit while preserving each component's type hierarchy.
 * Persisted so it survives reloads and applies to every screen in the app.
 */
export const FONT_SCALES: Record<string, string> = {
  small: "0.9",
  default: "1",
  large: "1.1",
  xlarge: "1.2",
};

export const FONT_SCALE_KEY = "app_font_scale";
export const FONT_SCALE_EVENT = "continua:font-scale";
export const MIN_FONT_PERCENT = 50;
export const MAX_FONT_PERCENT = 150;
let currentFontScale: string | undefined;

/** Keep precise slider settings and migrate existing S/M/L/XL values. */
export function normalizeFontScale(scale: string): string {
  const numeric = scale.trim() ? Number(scale) : NaN;
  if (!Number.isFinite(numeric)) return "1";
  const percent = Math.round(Math.min(MAX_FONT_PERCENT, Math.max(MIN_FONT_PERCENT, numeric * 100)));
  return String(percent / 100);
}

/** Apply a raw numeric scale (e.g. "1.1") and persist it. */
export function applyFontScale(scale: string) {
  const value = normalizeFontScale(scale);
  currentFontScale = value;
  document.documentElement.style.setProperty("--app-font-scale", value);
  document.documentElement.style.fontSize = `${Number((16 * Number(value)).toFixed(2))}px`;
  try { localStorage.setItem(FONT_SCALE_KEY, value); } catch {}
  window.dispatchEvent(new Event(FONT_SCALE_EVENT));
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
  if (currentFontScale !== undefined) return currentFontScale;
  try { return normalizeFontScale(localStorage.getItem(FONT_SCALE_KEY) || "1"); } catch { return "1"; }
}
