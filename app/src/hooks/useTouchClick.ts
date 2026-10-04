import { useRef, type TouchEvent } from "react";

/** Some mobile browsers stop inertia but omit the compatibility click for the
 * first tap. Dispatch one normal click from a completed, unmoved touch instead.
 * Cancelling touchend suppresses the subsequent compatibility click. There is
 * no timer or pointer-up navigation; mouse, keyboard and cancelled drags retain
 * their normal behavior. Attach directly to a button/link, not a scroll region. */
export function useTouchClick<T extends HTMLElement>() {
  const start = useRef<{ x: number; y: number; element: T; time: number } | null>(null);
  return {
    onTouchStart(event: TouchEvent<T>) {
      start.current = event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY, element: event.currentTarget, time: event.timeStamp }
        : null;
    },
    onTouchMove(event: TouchEvent<T>) {
      const point = start.current;
      if (event.touches.length !== 1 || (point && Math.hypot(event.touches[0].clientX - point.x, event.touches[0].clientY - point.y) > 8)) start.current = null;
    },
    onTouchCancel() { start.current = null; },
    onTouchEnd(event: TouchEvent<T>) {
      const point = start.current;
      start.current = null;
      const end = event.changedTouches[0];
      if (!point || !end || event.touches.length || event.timeStamp - point.time > 600 || point.element !== event.currentTarget ||
          Math.hypot(end.clientX - point.x, end.clientY - point.y) > 8 || !event.cancelable) return;
      event.preventDefault();
      event.currentTarget.click();
    },
  };
}
