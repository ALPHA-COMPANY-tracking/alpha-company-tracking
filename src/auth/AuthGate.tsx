import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SupabaseBackend } from '@/data/supabaseBackend';
import { DataProvider } from '@/store/DataProvider';
import { AppShell } from '@/AppShell';
import { LoginScreen } from '@/auth/LoginScreen';
import { PainelVendedor } from '@/vendedor/PainelVendedor';

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
  // Login de VENDEDOR (migração 0021) não abre a dashboard: vai para o
  // Painel do Vendedor, que só enxerga os pedidos dele.
  const userId = session?.user.id ?? null;
  const [conta, setConta] = useState<{ de: string; id: string; vendedor: { dono: string; nome: string } | null } | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    let vivo = true;
    Promise.all([
      supabase.rpc('conta_do_usuario'),
      supabase.from('dashboard_vendedores').select('dono_id,vendedor').eq('membro_id', userId).maybeSingle(),
    ]).then(([c, v]) => {
      if (!vivo) return;
      const vendedor = !v.error && v.data ? { dono: String(v.data.dono_id), nome: String(v.data.vendedor) } : null;
      setConta({ de: userId, id: !c.error && typeof c.data === 'string' ? c.data : userId, vendedor });
    });
    return () => {
      vivo = false;
    };
  }, [userId]);
  const contaAtual = conta && conta.de === userId ? conta : null;
  const contaId = contaAtual && !contaAtual.vendedor ? contaAtual.id : null;

  // Memoiza pelo ID, não pelo objeto `session`: o Supabase emite uma nova
  // sessão a cada renovação de token, e recriar o backend aí remontaria o
  // DataProvider (a tela ficava preta no meio do "Atualizar").
  const backend = useMemo(
    () => (supabase && contaId ? new SupabaseBackend(supabase, contaId) : null),
    [contaId],
  );

  if (session === undefined || (session && !contaAtual)) {
    return (
      <div className="min-h-screen grid place-items-center text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (session && contaAtual?.vendedor) {
    return (
      <PainelVendedor
        donoId={contaAtual.vendedor.dono}
        vendedor={contaAtual.vendedor.nome}
        onLogout={() => supabase?.auth.signOut()}
      />
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
