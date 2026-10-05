import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";
import { isNotFound } from "@/api/client";
import { fx } from "@/lib/chartPalette";

// Same name-matching convention OwnershipTab.tsx itself uses for its
// internal (mock-data) color assignment — kept here too since
// Fundamentals.ownership requires a `color` field.
function colorFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("institution")) return fx.institutional;
  if (n.includes("public") || n.includes("retail")) return fx.retail;
  if (n.includes("foreign")) return fx.foreign;
  if (n.includes("government")) return fx.government;
  if (n.includes("insider")) return fx.insider;
  return fx.public;
}

/** Real ownership breakdown from the Data Layer's `/ownership/:symbol`,
 *  shaped to match Fundamentals.ownership / Fundamentals.topShareholders
 *  (app/src/data/stockFundamentals.ts) so OwnershipTab needs no changes.
 *  Returns empty arrays — not an error — for a symbol with no ownership
 *  records on file yet. */
export function useOwnership(symbol: string | undefined) {
  const query = useQuery({
    queryKey: ["continua", "ownership", symbol],
    queryFn: () => corporateActionsApi.getOwnership(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  const ownership = useMemo(
    () => (query.data ?? []).map((r) => ({ name: r.holderName, value: Number(r.percentHeld) || 0, color: colorFor(r.holderName) })),
    [query.data]
  );
  const topShareholders = useMemo(
    () => (query.data ?? []).map((r) => ({ name: r.holderName, type: r.holderType, pct: Number(r.percentHeld) || 0 })),
    [query.data]
  );

  return { ownership, topShareholders, isLoading: query.isLoading };
}
