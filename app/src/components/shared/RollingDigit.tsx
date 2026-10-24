import { useLayoutEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

function WheelGlyph({ digit, position }: { digit: number; position: ReturnType<typeof useSpring> }) {
  const y = useTransform(position, value => `${((((digit-value)%10)+15)%10-5)*100}%`);
  return <motion.span className="rolling-wheel-glyph" style={{y}}>{digit}</motion.span>;
}

/** A continuously retargeted spring, rather than restarting a CSS animation
 * on each pointer event. Only the visible exact target is announced. */
export function RollingDigit({old, digit, down}: {old: string; digit: string; down: boolean}) {
  const reduced = useReducedMotion();
  const target = useMotionValue(Number(old.trim() || digit));
  const position = useSpring(target,{stiffness:550,damping:42,mass:0.55});
  useLayoutEffect(() => {
    const current = position.get();
    const number = Number(digit);
    const base = Math.floor(current/10)*10+number;
    const next = down ? (base>current ? base-10 : base) : (base<current ? base+10 : base);
    target.set(next);
  },[digit,down,position,target]);
  if(reduced) return <>{digit}</>;
  return <span className="rolling-wheel">{Array.from({length:10},(_,digit)=><WheelGlyph key={digit} digit={digit} position={position}/>)}</span>;
}
