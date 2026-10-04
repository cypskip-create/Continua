import { useEffect, useRef } from "react";
import { registerPageRefresh } from "@/lib/pageRefresh";

export function usePageRefresh(refresh: () => Promise<unknown>) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => registerPageRefresh(() => latest.current()), []);
}
