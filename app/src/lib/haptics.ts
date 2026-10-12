export type FeedbackKind = "selection" | "success" | "error";
const patterns: Record<FeedbackKind, number | number[]> = {
  selection: 8,
  success: [12, 35, 20],
  error: [25, 35, 25, 35, 25],
};
let lastFeedback = 0;
/** Progressive enhancement: no fake Safari haptics or hidden form hacks. */
export function feedback(kind: FeedbackKind) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (document.visibilityState !== "visible" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const now = Date.now();
  if (kind === "selection" && now - lastFeedback < 75) return;
  lastFeedback = now;
  try { navigator.vibrate(patterns[kind]); } catch { /* Unsupported device: keep the action working. */ }
}
