import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase,restoreBrowserSession,clearBrowserSessionCookie } from '@/integrations/supabase/client';
import {queryClient} from '@/lib/queryClient';
import {clearPrivateSessionCache} from '@/lib/privateSessionCache';
import {signupAcknowledgement} from '@/lib/legalPolicy';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recoveryMode: boolean;
  signUp: (email: string, password: string, fullName: string, acknowledgement:{adult:boolean;terms:boolean},captchaToken?:string) => Promise<{ error: any; session: Session | null }>;
  signIn: (email: string, password: string,captchaToken?:string) => Promise<{ error: any; session: Session | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string,captchaToken?:string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode,setRecoveryMode]=useState(false);
  const owner=useRef<string|null>(null);

  useEffect(() => {
    let bootstrapping=true,active=true;
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const next=session?.user.id??null;
        if((owner.current&&owner.current!==next)||event==='SIGNED_OUT'){
          void queryClient.cancelQueries();queryClient.clear();
          try{clearPrivateSessionCache(localStorage);}catch{/* Storage may be unavailable. */}
          window.dispatchEvent(new Event('continua:session-cleared'));
        }
        owner.current=next;
        if(event==='PASSWORD_RECOVERY')setRecoveryMode(true);
        if(event==='SIGNED_OUT')setRecoveryMode(false);
        setSession(session);
        setUser(session?.user ?? null);
        if(!bootstrapping)setLoading(false);
      }
    );

    void restoreBrowserSession().then(()=>supabase.auth.getSession()).then(({data})=>{
      if(!active)return;setSession(data.session);setUser(data.session?.user??null);owner.current=data.session?.user.id??null;
    }).catch(()=>{/* Auth screen offers retry; never fabricate a session. */}).finally(()=>{bootstrapping=false;if(active)setLoading(false);});
    return () => {active=false;subscription.unsubscribe();};
  }, []);

  const signUp = async (email: string, password: string, fullName: string, acknowledgement:{adult:boolean;terms:boolean},captchaToken?:string) => {
    const legal=signupAcknowledgement(acknowledgement.adult,acknowledgement.terms);
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        captchaToken,
        data: {
          full_name: fullName,
          ...legal,
        }
      }
    });
    return { error, session: data.session };
  };

  const signIn = async (email: string, password: string,captchaToken?:string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options:{captchaToken},
    });
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      setLoading(false);
    }
    return { error, session: data.session };
  };

  const signOut = async () => {
    await clearBrowserSessionCookie();
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(error)throw error;
    void queryClient.cancelQueries();queryClient.clear();
    try{clearPrivateSessionCache(localStorage);}catch{/* Optional storage. */}
  };

  const resetPassword = async (email: string,captchaToken?:string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
      captchaToken,
    });
    return { error };
  };

  const value = {
    user,
    session,
    loading,
    recoveryMode,
    signUp,
    signIn,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
