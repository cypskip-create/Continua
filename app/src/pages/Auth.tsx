import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Eye, EyeOff, Loader2, Mail, Lock, User, ArrowLeft,
  ShieldCheck, TrendingUp, CheckCircle2,
} from 'lucide-react';
import { ContinuaMark } from '@/components/shared/ContinuaMark';
import './auth.css';
import { lovable } from '@/integrations/lovable';
import { useTouchClick } from '@/hooks/useTouchClick';

type Mode = 'signin' | 'signup' | 'reset';


function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: '', barClass: '' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Too short', barClass: 'bg-bear' },
    { label: 'Getting there', barClass: 'bg-accent' },
    { label: 'Decent', barClass: 'bg-accent' },
    { label: 'Strong', barClass: 'bg-bull' },
    { label: 'Excellent 💪', barClass: 'bg-bull' },
  ];
  return { score, ...levels[score] };
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [success, setSuccess] = useState(false);

  const { signUp, signIn, resetPassword, user, loading: sessionLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const submitTap = useTouchClick<HTMLButtonElement>();
  const { toast } = useToast();

  const isSignUp = mode === 'signup';
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);


  useEffect(() => {
    // AppLockGate remounts this screen when the account changes. Redirect
    // from the shared session rather than local state lost by that remount.
    if (!sessionLoading && user && mode !== 'reset') {
      const from = location.state?.from;
      navigate(from?.pathname?.startsWith('/') && from.pathname !== '/auth' ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : '/', { replace: true });
    }
  }, [sessionLoading, user, mode, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      if (mode === 'reset') {
        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: "Couldn't send reset link", description: error.message, variant: 'destructive' });
        } else {
          setResetSent(true);
        }
        setLoading(false);
        return;
      }

      let result;
      if (isSignUp) {
        if (!fullName.trim()) {
          toast({ title: 'Error', description: 'Please enter your full name', variant: 'destructive' });
          setLoading(false);
          return;
        }
        result = await signUp(email, password, fullName);
      } else {
        result = await signIn(email, password);
      }

      if (result.error) {
        toast({ title: 'Error', description: result.error.message, variant: 'destructive' });
        setLoading(false);
      } else {
        if (isSignUp && !result.session) {
          toast({ title: 'Check your email', description: 'Confirm your address, then sign in.' });
          setMode('signin');
        } else {
          setSuccess(true);
        }
        setLoading(false);
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (error) toast({ title: 'Error', description: error.message || 'Failed to sign in with Google', variant: 'destructive' });
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = (next: Mode) => { setMode(next); setResetSent(false); };

  return (
    <div className="continua-auth min-h-screen">
      <header className="auth-header"><Link to="/landing" className="auth-brand"><ContinuaMark size={36} appearance="light"/><span>continua<span className="auth-dot">.</span></span></Link><Link to="/landing" className="auth-home"><ArrowLeft size={16}/> Back to website</Link></header>
      <main className="auth-layout">
        <aside className="auth-story"><p className="auth-eyebrow">YOUR NEXT CHAPTER</p><h2>See more.<br/><span>Understand more.</span></h2><p className="auth-intro">Your portfolio deserves more than a price. A clearer perspective starts here.</p><div className="auth-art" aria-hidden="true"><img src="/landing/engine-core.png" alt=""/><span className="auth-art-caption">Research first. React second.</span></div><div className="auth-benefits"><span><TrendingUp size={17}/> Follow the NSE</span><span><ShieldCheck size={17}/> Keep your research private</span></div><p className="auth-risk">Research and portfolio tracking. No trading execution. Capital is at risk.</p></aside>
      <div className="auth-form-column flex flex-col items-center justify-center relative">
        <p className="auth-eyebrow mb-4">MAKE IT YOURS</p>

        <motion.div
          className="auth-card relative w-full overflow-hidden"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          {/* Success flourish — briefly shown right before navigating away */}
          <AnimatePresence>
            {success && (
              <motion.div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                  className="h-14 w-14 rounded-full bg-bull/15 text-bull flex items-center justify-center"
                >
                  <CheckCircle2 className="h-7 w-7" />
                </motion.div>
                <p className="text-[0.875rem] font-semibold">
                  {isSignUp ? "You're in! Welcome to Continua" : 'Welcome back!'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {mode !== 'reset' ? (
            <>
              {/* Sign in / Sign up segmented toggle — pill slides between the two */}
              <div className="relative grid grid-cols-2 p-1.5 m-4 mb-0 bg-muted/50 rounded-full">
                <motion.div
                  className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] rounded-full bg-background shadow-sm"
                  animate={{ x: mode === 'signup' ? 'calc(100% + 4px)' : 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`relative z-10 h-9 rounded-full text-[0.84375rem] font-semibold transition-colors ${mode === 'signin' ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`relative z-10 h-9 rounded-full text-[0.84375rem] font-semibold transition-colors ${mode === 'signup' ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  Sign Up
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === 'signup' ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: mode === 'signup' ? -16 : 16 }}
                  transition={{ duration: 0.22 }}
                  className="p-6 pt-5"
                >
                  <h1 className="text-[1.1875rem] font-extrabold tracking-tight">
                    {isSignUp ? 'Create your account' : 'Welcome back'}
                  </h1>
                  <p className="text-[0.8125rem] text-muted-foreground mt-1 mb-5">
                    {isSignUp ? 'Start researching and tracking NSE stocks in minutes.' : 'Log in to pick up where you left off.'}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 mb-4 font-medium rounded-xl transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                  >
                    {googleLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    Continue with Google
                  </Button>

                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                    <div className="relative flex justify-center text-[0.6875rem]"><span className="bg-card px-2 text-muted-foreground uppercase tracking-wide">or use email</span></div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <AnimatePresence initial={false}>
                      {isSignUp && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="text"
                              aria-label="Full name"
                              autoComplete="name"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="Full name"
                              className="h-12 pl-10 rounded-xl text-[0.875rem] focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)] transition-shadow"
                              required={isSignUp}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        aria-label="Email address"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="h-12 pl-10 rounded-xl text-[0.875rem] focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)] transition-shadow"
                        required
                      />
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          aria-label="Password"
                          autoComplete={isSignUp ? 'new-password' : 'current-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Password"
                          className="h-12 pl-10 pr-10 rounded-xl text-[0.875rem] focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)] transition-shadow"
                          required
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>

                      {isSignUp && password.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex gap-0.5">
                            {[0, 1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className={`flex-1 rounded-full transition-colors duration-300 ${i < passwordStrength.score ? passwordStrength.barClass : 'bg-muted-foreground/15'}`}
                              />
                            ))}
                          </div>
                          <span className="text-[0.65625rem] font-medium text-muted-foreground whitespace-nowrap">{passwordStrength.label}</span>
                        </div>
                      )}
                    </div>

                    {!isSignUp && (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => switchMode('reset')} className="text-[0.78125rem] font-semibold text-primary hover:underline">
                          Forgot password?
                        </button>
                      </div>
                    )}

                    <Button
                      {...submitTap}
                      type="submit"
                      className="w-full h-12 text-[0.90625rem] font-semibold rounded-xl mt-1 transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
                      disabled={loading}
                    >
                      {loading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isSignUp ? 'Creating account…' : 'Logging in…'}</>
                      ) : (
                        isSignUp ? 'Create account' : 'Log In'
                      )}
                    </Button>
                  </form>
                </motion.div>
              </AnimatePresence>
            </>
          ) : (
            /* Reset password */
            <div className="p-6">
              <button type="button" onClick={() => switchMode('signin')} className="flex items-center gap-1.5 text-[0.78125rem] font-semibold text-muted-foreground mb-4">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to log in
              </button>
              {resetSent ? (
                <motion.div
                  className="text-center py-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                    <Mail className="h-5 w-5" />
                  </div>
                  <h2 className="text-[1rem] font-bold mb-1">Check your inbox</h2>
                  <p className="text-[0.8125rem] text-muted-foreground">We've sent a password reset link to <span className="font-medium text-foreground">{email}</span>.</p>
                </motion.div>
              ) : (
                <>
                  <h1 className="text-[1.1875rem] font-extrabold tracking-tight">Reset your password</h1>
                  <p className="text-[0.8125rem] text-muted-foreground mt-1 mb-5">Enter your email and we'll send you a link to reset it.</p>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        aria-label="Email address"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="h-12 pl-10 rounded-xl text-[0.875rem] focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)] transition-shadow"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full h-12 text-[0.90625rem] font-semibold rounded-xl transition-transform hover:-translate-y-0.5 active:scale-[0.97]" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Send reset link
                    </Button>
                  </form>
                </>
              )}
            </div>
          )}
        </motion.div>

        {mode !== 'reset' && (
          <p className="text-[0.8125rem] text-muted-foreground mt-5 text-center">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}>
              {isSignUp ? 'Log In' : 'Sign Up'}
            </button>
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-6 text-[0.6875rem] text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          Evidence-led research on NSE-listed companies
        </div>

        <p className="text-[0.6875rem] text-muted-foreground/80 mt-3 text-center max-w-xs">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
      </main>
    </div>
  );
}
