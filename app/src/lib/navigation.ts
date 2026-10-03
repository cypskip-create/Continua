import type { NavigateFunction } from "react-router-dom";

/** Go back when this SPA owns a previous entry, otherwise use a safe route. */
export function navigateBack(navigate: NavigateFunction, fallback = "/") {
  const index = window.history.state?.idx;
  if (typeof index === "number" && index > 0) navigate(-1);
  else navigate(fallback, { replace: true });
}
