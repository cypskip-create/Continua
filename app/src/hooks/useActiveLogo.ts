import { useEffect, useState } from "react";
import { DEFAULT_LOGO_LIGHT_PATH, DEFAULT_LOGO_DARK_PATH, SEASONAL_LOGO_CAMPAIGNS } from "@/config/seasonalLogo";

/** Turns a campaign's "MM-DD" or "YYYY-MM-DD" string into a real Date in the
 *  given year (the year only matters for recurring "MM-DD" dates). */
function resolveDate(value: string, year: number, endOfDay: boolean): Date {
  const isRecurring = value.length === 5; // "MM-DD"
  const iso = isRecurring ? `${year}-${value}` : value;
  return new Date(`${iso}T${endOfDay ? "23:59:59" : "00:00:00"}`);
}

/** True if `now` falls within [start, end], handling ranges that cross
 *  New Year's Eve (e.g. Dec 20 → Jan 2) by checking both this year's and
 *  last year's version of the range. */
function isCampaignActive(startRaw: string, endRaw: string, now: Date): boolean {
  for (const year of [now.getFullYear(), now.getFullYear() - 1]) {
    const start = resolveDate(startRaw, year, false);
    let end = resolveDate(endRaw, year, true);
    if (end < start) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate(), 23, 59, 59);
    if (now >= start && now <= end) return true;
  }
  return false;
}

/** Reads whether the currently-applied theme is dark (covers both "dark"
 *  and "amoled" — both should use the dark-mode art) directly off
 *  <html>'s class, and stays in sync as the person switches theme in
 *  Settings. Reading the live class rather than the theme *setting* means
 *  "system" is handled for free — ThemeProvider already resolves "system"
 *  down to a concrete "light"/"dark" class on <html>. */
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark") || document.documentElement.classList.contains("amoled")
  );

  useEffect(() => {
    const read = () => {
      const root = document.documentElement;
      setIsDark(root.classList.contains("dark") || root.classList.contains("amoled"));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/**
 * Resolves which logo image should render right now: the first scheduled
 * seasonal campaign whose date range includes today (in whichever variant
 * matches the current theme), or the normal light/dark logo if no campaign
 * applies. See app/src/config/seasonalLogo.ts to add/update campaigns or
 * change the normal logo — this hook needs no changes for either.
 */
export function useActiveLogo(appearance?: "light" | "dark"): string {
  const themeIsDark = useIsDarkTheme();
  const isDark = appearance ? appearance === "dark" : themeIsDark;
  const [now] = useState(() => new Date()); // stable for the session; a new day means a fresh page load anyway

  const active = SEASONAL_LOGO_CAMPAIGNS.find((c) => isCampaignActive(c.startDate, c.endDate, now));
  if (active) {
    const themed = isDark ? active.imagePathDark : active.imagePathLight;
    return themed ?? active.imagePath ?? (isDark ? DEFAULT_LOGO_DARK_PATH : DEFAULT_LOGO_LIGHT_PATH);
  }
  return isDark ? DEFAULT_LOGO_DARK_PATH : DEFAULT_LOGO_LIGHT_PATH;
}
