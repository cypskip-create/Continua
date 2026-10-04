import { Moon, Sun, Zap } from "lucide-react";
import { useTheme, Theme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const options: { value: Theme; label: string; icon: any }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "amoled", label: "AMOLED", icon: Zap },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center rounded-full bg-muted p-0.5" role="tablist" aria-label="Theme">
      {options.map((opt) => {
        const active = theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            data-small-target
            onClick={() => setTheme(opt.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            aria-selected={active}
            role="tab"
          >
            <Icon className="h-3 w-3" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
