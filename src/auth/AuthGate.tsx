import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SupabaseBackend } from '@/data/supabaseBackend';
import { DataProvider } from '@/store/DataProvider';
import { AppShell } from '@/AppShell';
import { LoginScreen } from '@/auth/LoginScreen';

/** Gate de autenticação para o modo nuvem (Supabase configurado). */
export function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Memoiza pelo ID do usuário, não pelo objeto `session`: o Supabase emite
  // uma nova sessão a cada renovação de token, e recriar o backend aí
  // remontaria o DataProvider (a tela ficava preta no meio do "Atualizar").
  const userId = session?.user.id ?? null;
  const backend = useMemo(
    () => (supabase && userId ? new SupabaseBackend(supabase, userId) : null),
    [userId],
  );

  if (session === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (!session || !backend) return <LoginScreen />;

  return (
    <DataProvider backend={backend}>
      <AppShell onLogout={() => supabase?.auth.signOut()} email={session.user.email ?? undefined} />
    </DataProvider>
  );
}
