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

  // De qual conta são os dados: a do dono, se este login for de um sócio
  // (migração 0017); a própria, para o dono. Sem a migração, a função não
  // existe e fica a própria conta — como sempre foi.
  const userId = session?.user.id ?? null;
  const [conta, setConta] = useState<{ de: string; id: string } | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    let vivo = true;
    supabase.rpc('conta_do_usuario').then(({ data, error }) => {
      if (vivo) setConta({ de: userId, id: !error && typeof data === 'string' ? data : userId });
    });
    return () => {
      vivo = false;
    };
  }, [userId]);
  const contaId = conta && conta.de === userId ? conta.id : null;

  // Memoiza pelo ID, não pelo objeto `session`: o Supabase emite uma nova
  // sessão a cada renovação de token, e recriar o backend aí remontaria o
  // DataProvider (a tela ficava preta no meio do "Atualizar").
  const backend = useMemo(
    () => (supabase && contaId ? new SupabaseBackend(supabase, contaId) : null),
    [contaId],
  );

  if (session === undefined || (session && !contaId)) {
    return (
      <div className="min-h-screen grid place-items-center text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (!session || !backend) return <LoginScreen />;

  return (
    <DataProvider backend={backend}>
      <AppShell
        onLogout={() => supabase?.auth.signOut()}
        email={session.user.email ?? undefined}
        socio={contaId !== session.user.id}
      />
    </DataProvider>
  );
}
