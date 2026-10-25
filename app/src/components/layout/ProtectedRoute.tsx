import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, initializationError, retrySession } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if(initializationError)return <main className="min-h-screen grid place-items-center p-6"><div role="alert" className="max-w-sm space-y-4"><h1 className="text-xl font-semibold">Reconnect your account</h1><p>{initializationError}</p><button className="rounded-full bg-primary px-5 py-3 text-primary-foreground" onClick={retrySession}>Retry account connection</button></div></main>;
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
