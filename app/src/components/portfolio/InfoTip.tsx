import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoTipProps {
  children: React.ReactNode; // the description text
  className?: string;
}

/** The small (i) beside a section title, used across the portfolio tabs.
 *  Tapping it opens a floating description instead of being decorative —
 *  every InfoTip usage should read like a tooltip, not an icon. */
export function InfoTip({ children, className }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-small-target
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-[0.75rem] leading-snug p-3" onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
