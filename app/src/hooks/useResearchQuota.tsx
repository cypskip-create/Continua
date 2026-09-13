import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ResearchQuotaResult {
  allowed: boolean;
  already_counted: boolean;
  is_premium: boolean;
  limit: number | null;
  remaining: number | null;
}

/**
 * Simply Wall St-style free-tier limit: 5 DIFFERENT stocks' full research
 * report per calendar month. Reaching a stock's "1. Valuation" section is
 * what uses one of those 5 (see StockDetail's report scroll-spy) —
 * re-opening a stock already counted this month is always free again.
 * Premium is unlimited. Enforced server-side (see the record_research_view
 * / get_research_quota RPCs) so it can't be bypassed by refreshing or
 * calling the API directly — this hook is just a thin client for those.
 */
export function useResearchQuota() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);

  /** Peek at quota WITHOUT spending a slot — safe to call on every stock
   *  page load to decide whether to even attempt the real check later. */
  const peek = useCallback(async (symbol: string): Promise<ResearchQuotaResult | null> => {
    if (!user) return null;
    const { data, error } = await supabase.rpc("get_research_quota", { p_symbol: symbol });
    if (error) { console.error("get_research_quota failed", error); return null; }
    return data as unknown as ResearchQuotaResult;
  }, [user]);

  /** Actually records the view (spends a slot if this is a new stock this
   *  month, unless already counted or premium). Call this once, the first
   *  time a stock's Valuation section becomes visible per page load. */
  const recordView = useCallback(async (symbol: string): Promise<ResearchQuotaResult | null> => {
    if (!user) return null;
    setChecking(true);
    const { data, error } = await supabase.rpc("record_research_view", { p_symbol: symbol });
    setChecking(false);
    if (error) { console.error("record_research_view failed", error); return null; }
    return data as unknown as ResearchQuotaResult;
  }, [user]);

  return { peek, recordView, checking };
}