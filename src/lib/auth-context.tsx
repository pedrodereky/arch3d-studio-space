import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  cau_number: string | null;
  office_name: string | null;
  role: "admin" | "user";
  total_generations: number;
  total_cost_usd: number;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  setupCompleted: boolean | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    metadata: { full_name: string; cau_number?: string; office_name?: string },
  ) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: roles }, { data: cfg }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("instance_config").select("setup_completed").eq("id", 1).maybeSingle(),
    ]);
    setProfile((prof as unknown as Profile) ?? null);
    const roleList = (roles ?? []) as ReadonlyArray<{ role: string }>;
    setIsAdmin(roleList.some((r) => r.role === "admin"));
    setSetupCompleted((cfg?.setup_completed as boolean | null) ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          void loadProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void loadProfile(data.session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    profile,
    isAdmin,
    isLoading,
    setupCompleted,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email, password, metadata) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: metadata,
        },
      });
      return { error };
    },
    signInWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/app` },
      });
      return { error };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      return { error };
    },
    refreshProfile: async () => {
      if (user) await loadProfile(user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
