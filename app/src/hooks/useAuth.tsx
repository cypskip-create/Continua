import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {signupAcknowledgement} from '@/lib/legalPolicy';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
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
    await supabase.auth.signOut();
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
