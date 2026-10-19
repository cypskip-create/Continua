import { useEffect, useRef, useState } from "react";
import {createVerificationCallbacks} from '@/lib/botVerification';

type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
// Public widget identifier, restricted to the three owned deployment hostnames.
const AUTH_SITE_KEY=import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY || '0x4AAAAAAFbf8SzHtO9iWsEA';
export const AUTH_BOT_CHECK_CONFIGURED = !!AUTH_SITE_KEY;
let scriptLoad: Promise<void> | undefined;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptLoad)
    scriptLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        scriptLoad = undefined;
        reject(new Error("Bot verification timed out. Reload to retry."));
      }, 30000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        scriptLoad = undefined;
        reject(new Error("Bot verification could not load. Reload to retry."));
      };
      document.head.appendChild(script);
    });
  return scriptLoad;
}
/** Token is verified by Supabase Auth when CAPTCHA is enabled in its dashboard.
 * A widget alone does not protect the direct provider endpoint. */
export function AuthBotCheck({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),[attempt,setAttempt]=useState(0);
  useEffect(() => {
    if (!AUTH_BOT_CHECK_CONFIGURED) return;
    let cancelled = false,
      id: string | undefined;
    const callbacks=createVerificationCallbacks(onToken,setError);
    void load()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: AUTH_SITE_KEY,
          size: "flexible",
          retry: 'auto',
          'retry-interval': 8000,
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          callback: callbacks.success,
          'expired-callback': callbacks.expired,
          'timeout-callback': callbacks.timeout,
          'unsupported-callback': callbacks.unsupported,
          'error-callback': () => callbacks.fail('Verification could not complete. Please retry verification.'),
        });
      })
      .catch((e) => {
        if (!cancelled) {
          callbacks.fail(e.message);
        }
      });
    return () => {
      cancelled = true;
      callbacks.dispose();
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken,attempt]);
  if (!AUTH_BOT_CHECK_CONFIGURED) return null;
  return (
    <div className="w-full max-w-md mb-4">
      <div ref={ref} />
      <button type="button" className="mt-2 text-xs text-primary underline" onClick={()=>{onToken('');setError('');setAttempt(v=>v+1);}}>Retry verification</button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
