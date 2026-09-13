import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FullLockProps {
  title: string;
  description: string;
}

/** Unlike LockedPreview (a blurred teaser of real data), this shows NO
 *  preview at all — for sections that are premium-only outright, like
 *  Portfolio → Analysis. Use LockedPreview instead when free users should
 *  still see a real, un-fabricated slice of the data. */
export function FullLock({ title, description }: FullLockProps) {
  const navigate = useNavigate();
  return (
    <div className="card-gradient rounded-2xl p-8 flex flex-col items-center text-center gap-3">
      <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
      <button
        data-small-target
        onClick={() => navigate("/upgrade")}
        className="h-9 px-5 rounded-full bg-primary text-primary-foreground text-[12px] font-bold active:opacity-80 transition-opacity mt-1"
      >
        Upgrade to Premium
      </button>
    </div>
  );
}