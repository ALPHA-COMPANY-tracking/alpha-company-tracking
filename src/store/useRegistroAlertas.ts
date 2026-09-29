// O registro de alertas de clientes, sempre em dia na dashboard aberta:
// carrega ao abrir e a cada minuto (o servidor grava sozinho a cada pedido
// que chega) e completa o que faltar com os pedidos carregados.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pedido } from '@/types';
import { supabase } from '@/lib/supabase';
import { alertasDosPedidos } from '@/lib/clientes';
import { type AlertaRegistrado, alertasFaltantes, carregarRegistro, marcarVistos, registrar } from '@/lib/alertasRegistro';

export interface RegistroAlertas {
  /** null = ainda carregando ou tabela inexistente (migração 0024). */
  registro: AlertaRegistrado[] | null;
  disponivel: boolean;
  marcarVisto: (ids: number[]) => Promise<void>;
}

export function useRegistroAlertas(pedidos: Pedido[]): RegistroAlertas {
  const [registro, setRegistro] = useState<AlertaRegistrado[] | null>(null);
  const [disponivel, setDisponivel] = useState(true);
  const [conta, setConta] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const r = await carregarRegistro();
    setDisponivel(r !== null);
    setRegistro(r);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('conta_do_usuario').then(({ data }) => setConta(typeof data === 'string' ? data : null));
    recarregar();
    const t = setInterval(recarregar, 60_000);
    const aoVoltar = () => document.visibilityState === 'visible' && recarregar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [recarregar]);

  // Completa o registro com o que a dashboard acha (pedidos antigos, nome).
  // Cada pedido+nível é tentado uma vez por sessão: se a gravação falhar,
  // não fica tentando em laço.
  const sincronizando = useRef(false);
  const tentados = useRef(new Set<string>());
  useEffect(() => {
    if (!registro || !conta || sincronizando.current) return;
    const faltam = alertasFaltantes(alertasDosPedidos(pedidos), registro).filter(
      ([id, a]) => !tentados.current.has(`${id}:${a.nivel}`),
    );
    if (faltam.length === 0) return;
    sincronizando.current = true;
    for (const [id, a] of faltam) tentados.current.add(`${id}:${a.nivel}`);
    const porId = new Map(pedidos.map((p) => [p.id, p]));
    Promise.all(faltam.map(([id, a]) => registrar(conta, porId.get(id)!, a)))
      .then(recarregar)
      .finally(() => {
        sincronizando.current = false;
      });
  }, [pedidos, registro, conta, recarregar]);

  const marcarVisto = useCallback(
    async (ids: number[]) => {
      const agora = new Date().toISOString();
      setRegistro((r) => r?.map((a) => (ids.includes(a.id) ? { ...a, visto_em: agora } : a)) ?? r);
      await marcarVistos(ids);
    },
    [],
  );

  return { registro, disponivel, marcarVisto };
}
