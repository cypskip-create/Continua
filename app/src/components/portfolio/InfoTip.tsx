import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoTipProps {
  children: React.ReactNode; // the description text
  className?: string;
  label?: string;
}

/** The small (i) beside a section title, used across the portfolio tabs.
 *  Tapping it opens a floating description instead of being decorative —
 *  every InfoTip usage should read like a tooltip, not an icon. */
export function InfoTip({ children, className, label = "What does this tool do?" }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-small-target
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] text-sm leading-relaxed p-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
