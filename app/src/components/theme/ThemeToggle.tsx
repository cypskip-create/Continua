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
    <div className="grid w-full grid-cols-3 gap-1 rounded-full bg-muted p-1" role="group" aria-label="Theme">
      {options.map((opt) => {
        const active = theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            data-small-target
            onClick={() => setTheme(opt.value)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-[0.6875rem] font-medium transition-colors",
              active ? "contrast-active" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={active}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
