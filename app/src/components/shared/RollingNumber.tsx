import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { rollingDigits, rollingDirection } from "@/lib/rollingNumber";

/** Rolls only changed digits, aligned by place value; never animates through
 * invented intermediate financial values or announces animation frames. */
export const RollingNumber = memo(function RollingNumber({ value, className }: { value: string | number | null | undefined; className?: string }) {
  const text = value == null ? '' : String(value);
  const previous = useRef(text);
  const [transition, setTransition] = useState({ from: text, to: text, revision: 0, settled: true });
  useLayoutEffect(() => {
    if (previous.current === text) return;
    const from = previous.current;
    setTransition(current => ({ from, to: text, revision: current.revision + 1, settled: false }));
    previous.current = text;
  }, [text]);
  useEffect(() => {
    if (transition.settled) return;
    const revision = transition.revision;
    // Retarget fast scrubs immediately; never queue old values. Retire digit
    // layers after the short animation, including when reduced motion is on.
    const timer = window.setTimeout(() => setTransition(current => current.revision === revision ? {...current, settled: true} : current), 180);
    return () => window.clearTimeout(timer);
  }, [transition.revision, transition.settled]);
  const down = rollingDirection(transition.from, transition.to) === 'down';
  return <span className={cn("rolling-number", className)} aria-label={text}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true" className="rolling-number-digits">
      {transition.settled ? transition.to : rollingDigits(transition.from, transition.to).map(({character, old, changed, place}) => {
        return <span key={place} className={/\d/.test(character) ? "rolling-digit" : "rolling-symbol"}>
          {changed ? <span key={transition.revision} className={cn("rolling-digit-motion", down && "rolling-digit-down")}>
            <span className="rolling-digit-old">{old}</span>
            <span className="rolling-digit-new">{character}</span>
          </span> : character}
        </span>;
      })}
    </span>
  </span>;
});
