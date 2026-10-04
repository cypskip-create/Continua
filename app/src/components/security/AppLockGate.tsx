import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isAppLockEnabled, verifyAppLock } from "@/lib/appLock";

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div role="status" className="grid min-h-dvh place-items-center bg-background"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading session" /></div>;
  if (!user) return <>{children}</>;
  // Remount the lock for each account; private screens must never flash before
  // an effect checks device settings or remain unlocked after an account switch.
  return <UserAppLockGate key={user.id} userId={user.id}>{children}</UserAppLockGate>;
}

function UserAppLockGate({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [locked, setLocked] = useState(() => isAppLockEnabled(userId));
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);

  const tryUnlock = useCallback(async () => {
    setVerifying(true);
    setFailed(false);
    try {
      const ok = await verifyAppLock(userId);
      if (ok) setLocked(false); else setFailed(true);
    } catch { setFailed(true); }
    finally { setVerifying(false); }
  }, [userId]);

  // Auto-prompt once as soon as we know the app should be locked.
  useEffect(() => {
    if (locked && !verifying) {
      tryUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[999] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <ShieldCheck className="h-8 w-8 text-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Continua is locked</h2>
        <p className="text-sm text-muted-foreground mt-1">Verify with your device Face ID, fingerprint, or PIN to continue.</p>
      </div>
      <Button onClick={tryUnlock} disabled={verifying} className="btn-primary gap-2 mt-2">
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
        {verifying ? "Verifying…" : "Unlock"}
      </Button>
      {failed && <p className="text-xs text-destructive">Verification failed or was cancelled. Try again.</p>}
    </div>
  );
}
