import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Rolls only changed digits, aligned by place value; never animates through
 * invented intermediate financial values or announces animation frames. */
export function RollingNumber({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  const previous = useRef(text);
  const [transition, setTransition] = useState({ from: text, to: text, revision: 0 });
  useEffect(() => {
    if (previous.current === text) return;
    const from = previous.current;
    setTransition(current => ({ from, to: text, revision: current.revision + 1 }));
    previous.current = text;
  }, [text]);
  const from = transition.from.padStart(transition.to.length, " ");
  const numeric = (s: string) => Number(s.replace(/[^\d.+-]/g, ""));
  const down = numeric(transition.to) < numeric(transition.from);
  return <span className={cn("rolling-number", className)} aria-label={text}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true" className="rolling-number-digits">
      {[...transition.to].map((character, index) => {
        const old = from[from.length - transition.to.length + index];
        const changed = /\d/.test(character) && old !== character;
        return <span key={index} className={/\d/.test(character) ? "rolling-digit" : "rolling-symbol"}>
          {changed ? <span key={transition.revision} className={cn("rolling-digit-motion", down && "rolling-digit-down")}>
            <span className="rolling-digit-old">{old?.trim() || character}</span>
            <span className="rolling-digit-new">{character}</span>
          </span> : character}
        </span>;
      })}
    </span>
  </span>;
}
