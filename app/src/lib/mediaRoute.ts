/** Stable story IDs resolve independently of the feed's category or pagination. */
export function mediaStoryUrl(id: string): string {
  return `/traders-hub?${new URLSearchParams({ tab: "media", article: id })}`;
}
