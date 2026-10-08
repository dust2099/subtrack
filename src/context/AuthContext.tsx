import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database.types';
import { AuthContext } from '@/context/auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileState, setProfileState] = useState<{
    userId: string;
    profile: Profile | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const updateProfile = useCallback((updatedProfile: Profile) => {
    setProfileState({ userId: updatedProfile.id, profile: updatedProfile });
  }, []);
  const profile =
    user && profileState?.userId === user.id ? profileState.profile : null;

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let active = true;

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (!active) return;

        if (error) {
          console.error('Failed to load user profile:', error.message);
          setProfileState({ userId, profile: null });
        } else {
          setProfileState({ userId, profile: data as Profile });
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load user profile:', error);
          setProfileState({ userId, profile: null });
        }
      }
    };

    void fetchProfile();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, updateProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}