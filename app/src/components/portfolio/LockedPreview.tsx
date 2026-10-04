import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LockedPreviewProps {
  /** True if the person can already see everything — renders children as-is. */
  unlocked: boolean;
  /** The portion visible to everyone, rendered above the locked area. */
  children: React.ReactNode;
  /** The portion behind the paywall — rendered blurred with the upgrade
   *  prompt centered over it, same convention across every gated widget
   *  in the portfolio tabs (dividend history, contributors, forecast). */
  locked: React.ReactNode;
  label?: string;
}

/** Continua's free plan shows real, un-fabricated data — just less of it.
 *  The blurred region is the SAME real numbers a premium user sees, not a
 *  placeholder graphic, so nothing here is invented to look more complete
 *  than the free tier actually is. */
export function LockedPreview({ unlocked, children, locked, label = "Upgrade" }: LockedPreviewProps) {
  const navigate = useNavigate();

  if (unlocked) return <>{children}{locked}</>;

  return (
    <>
      {children}
      <div className="relative mt-1">
        <div className="pointer-events-none select-none blur-[6px] opacity-60">{locked}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Lock className="h-3.5 w-3.5 text-primary" />
          </div>
          <button
            data-small-target
            onClick={() => navigate("/upgrade")}
            className="h-8 px-4 rounded-full bg-primary text-primary-foreground text-[0.6875rem] font-bold active:opacity-80 transition-opacity"
          >
            {label}
          </button>
        </div>
      </div>
    </>
  );
}
