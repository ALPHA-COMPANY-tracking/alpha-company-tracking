// ─────────────────────────────────────────────────────────────
// Alerta de Clientes: pedido duplicado e cliente que já roubou ou
// frustrou. Consulta antes de agendar + os pedidos em aberto em alerta.
// ─────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react';
import { Check, FileUp, Loader2, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { formatBRL, reaisToCents } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { GRAVIDADE, type NivelAlerta, ROTULO_ALERTA, alertasDosPedidos } from '@/lib/clientes';
import type { RegistroAlertas } from '@/store/useRegistroAlertas';
import { lerClientesDoCsv } from '@/lib/csvBluesales';
import { enviarHistoricoClientes } from '@/lib/clientesApi';
import { pedidosAtivos } from '@/lib/pedidos';
import { EtiquetaAlerta, SeloAlerta } from '@/components/alertas/SeloAlerta';
import { VerificarCliente } from '@/components/alertas/VerificarCliente';


/** "saiu_para_entrega" → "Saiu para entrega". */
function etapa(status: string | null): string {
  const s = (status ?? '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

export function AlertasScreen({ registro }: { registro: RegistroAlertas }) {
  const { pedidos, recarregar } = useData();
  const alertas = useMemo(() => alertasDosPedidos(pedidos), [pedidos]);
  const [filtro, setFiltro] = useState<NivelAlerta | 'todos'>('todos');

  const lista = useMemo(
    () =>
      pedidosAtivos(pedidos)
        .filter((p) => {
          const a = alertas.get(p.id);
          return (
            a && a.nivel !== 'recompra' && !registro.descartado(p.id, a) && (filtro === 'todos' || a.nivel === filtro)
          );
        })
        .sort(
          (a, b) =>
            GRAVIDADE[alertas.get(a.id)!.nivel] - GRAVIDADE[alertas.get(b.id)!.nivel] || b.data.localeCompare(a.data),
        ),
    [pedidos, alertas, filtro, registro],
  );
  const contagem = useMemo(() => {
    const c: Record<NivelAlerta, number> = { roubo: 0, frustracao: 0, duplicado: 0, whatsapp: 0, recompra: 0 };
    for (const [id, a] of alertas) if (!registro.descartado(id, a)) c[a.nivel] += 1;
    return c;
  }, [alertas]);

  const ativos = pedidosAtivos(pedidos);
  const semCodigo = ativos.filter((p) => !p.cpf_hash && !p.tel_hash).length;

  // ── Histórico (uma vez, pelo CSV) ──
  const arquivo = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  async function carregarHistorico(f: File) {
    setAviso(null);
    setCarregando(true);
    try {
      const { itens, linhas } = lerClientesDoCsv(await f.text());
      if (itens.length === 0) throw new Error('Nenhum pedido com CPF ou WhatsApp no arquivo.');
      const r = await enviarHistoricoClientes(itens);
      if (!r.ok) throw new Error(r.aviso);
      await recarregar();
      setAviso({ ok: true, texto: `${r.gravados} pedidos ganharam o código da cliente (de ${linhas} no arquivo). CPF e WhatsApp não foram guardados.` });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setCarregando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Alerta de Clientes</h1>
        <p className="text-[13px] text-dim mt-0.5">Pedido duplicado e cliente que já roubou ou frustrou — antes de agendar e de enviar</p>
      </div>

      <Panel title="Verificar cliente antes de agendar" hint="pelo CPF ou WhatsApp">
        <div className="p-3.5 lg:p-5">
          <VerificarCliente />
        </div>
      </Panel>

      <Panel
        title="Pedidos em aberto com alerta"
        right={
          <div className="flex flex-wrap gap-1 rounded-[10px] border border-line2 p-[3px]">
            {(['todos', 'roubo', 'frustracao', 'duplicado', 'whatsapp'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2.5 py-[5px] rounded-[7px] text-[11.5px] font-semibold ${filtro === f ? 'bg-chip text-tx' : 'text-dim hover:text-tx'}`}
              >
                {f === 'todos' ? 'Todos' : ROTULO_ALERTA[f]}
                {f !== 'todos' && <span className="text-dim2"> {contagem[f]}</span>}
              </button>
            ))}
          </div>
        }
      >
        {lista.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-dim2">
            Nenhum pedido em aberto com alerta{filtro === 'todos' ? '' : ` de "${ROTULO_ALERTA[filtro]}"`}.
          </div>
        ) : (
          <div>
            {lista.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 lg:px-5 py-3 border-t border-line/70 first:border-t-0">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="text-[13.5px] font-semibold text-tx truncate">{p.cliente || 'Cliente sem nome'}</div>
                  <div className="text-[11px] text-dim2 mono">
                    #{p.internal_id ?? '—'} · {formatDiaMes(p.data)} · {p.vendedor || 'sem vendedor'} · {etapa(p.status)}
                  </div>
                </div>
                <div className="min-w-0 basis-[260px] flex-1">
                  <SeloAlerta alerta={alertas.get(p.id)!} detalhe />
                </div>
                <span className="mono text-[12.5px] font-bold text-tx w-[86px] text-right">
                  {formatBRL(reaisToCents(Number(p.valor_agendado ?? p.valor) || 0))}
                </span>
                <BotaoDescartar onDescartar={() => registro.descartar(p, alertas.get(p.id)!, 'Erro de cadastro — descartado na tela')} />
              </div>
            ))}
          </div>
        )}
        <div className="px-3.5 lg:px-5 py-3 border-t border-line text-[11px] text-dim2 leading-relaxed">
          Só pedidos ainda em aberto (nem pagos, nem frustrados): dá tempo de confirmar ou cancelar antes de enviar. A mesma
          cliente é reconhecida pelo código do CPF ou do WhatsApp; "só pelo nome" é para pedido antigo sem código — confira.
          Pedido excluído da plataforma não conta.
        </div>
      </Panel>

      <RegistroDeAlertas registro={registro} />

      <Panel title="Histórico de clientes" hint={semCodigo ? `${semCodigo} pedidos ainda sem código` : 'todos os pedidos com código'}>
        <div className="p-3.5 lg:p-5 flex flex-col gap-3">
          <p className="m-0 text-[12.5px] text-dim leading-relaxed">
            Para os pedidos que chegaram antes do alerta existir: exporte do BlueSales o CSV de <b className="text-tx">todas as
            etapas</b> (desde o começo) e carregue aqui <b className="text-tx">uma vez</b>. Do arquivo vão ao servidor só o número
            do pedido, o CPF e o WhatsApp — lá eles viram código e são descartados. Os pedidos novos já chegam com código.
          </p>
          <div>
            <input
              ref={arquivo}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && carregarHistorico(e.target.files[0])}
            />
            <button
              onClick={() => arquivo.current?.click()}
              disabled={carregando}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold border border-line2 text-tx hover:bg-white/[0.04] disabled:opacity-60"
            >
              {carregando ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
              Carregar histórico (CSV do BlueSales)
            </button>
          </div>
          {aviso && (
            <div
              className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[12px] text-dim ${
                aviso.ok ? 'border-grn/35 bg-grn/[0.06]' : 'border-yel/40 bg-yel/[0.07]'
              }`}
            >
              {aviso.ok ? <Check size={14} className="text-grn shrink-0 mt-[2px]" /> : <TriangleAlert size={14} className="text-yel shrink-0 mt-[2px]" />}
              {aviso.texto}
            </div>
          )}
          <div className="flex items-center gap-2 text-[11.5px] text-dim2">
            <ShieldAlert size={13} className="text-gold" />
            Depois de carregar, apague o CSV do computador: ele tem CPF, telefone e endereço das clientes.
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Todos os alertas gravados no banco — o registro que fica. */
function RegistroDeAlertas({ registro }: { registro: RegistroAlertas }) {
  const { pedidos } = useData();
  const [limite, setLimite] = useState(30);
  const porId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos]);
  const lista = registro.registro ?? [];
  const quando = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <Panel title="Registro de alertas" hint="gravado sozinho a cada pedido do BlueSales">
      {!registro.disponivel ? (
        <div className="m-3.5 lg:m-5 flex items-start gap-2.5 rounded-[10px] border border-yel/40 bg-yel/[0.07] px-3.5 py-2.5 text-[12.5px] text-dim">
          <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
          Falta rodar a migração 0024 no Supabase para gravar o registro de alertas.
        </div>
      ) : lista.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-dim2">Nenhum alerta registrado ainda.</div>
      ) : (
        <div>
          {lista.slice(0, limite).map((a) => {
            const p = porId.get(a.pedido_id);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 lg:px-5 py-2.5 border-t border-line/70 first:border-t-0">
                <span className="mono text-[11.5px] text-dim2 w-[86px] shrink-0">{quando(a.criado_em)}</span>
                <EtiquetaAlerta nivel={a.nivel} />
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="text-[13px] font-semibold text-tx truncate">{p?.cliente || `Pedido #${a.pedido_numero ?? '—'}`}</div>
                  <div className="text-[11px] text-dim2 truncate">
                    #{a.pedido_numero ?? '—'}
                    {p && ` · ${p.vendedor || 'sem vendedor'} · ${etapa(p.status)}`}
                    {a.texto && ` · ${a.texto}`}
                  </div>
                </div>
                <span
                  title={a.motivo_descarte ?? undefined}
                  className={`text-[11px] shrink-0 ${a.descartado_em || a.visto_em ? 'text-dim2' : 'text-gold2 font-semibold'}`}
                >
                  {a.descartado_em ? `descartado ${quando(a.descartado_em)}` : a.visto_em ? `visto ${quando(a.visto_em)}` : 'novo'}
                </span>
              </div>
            );
          })}
          {lista.length > limite && (
            <button
              onClick={() => setLimite((l) => l + 30)}
              className="w-full py-3 border-t border-line text-[12.5px] font-semibold text-gold2 hover:text-gold"
            >
              Ver mais {Math.min(30, lista.length - limite)}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Descartar com confirmação na própria linha (o alerta fica no registro). */
function BotaoDescartar({ onDescartar }: { onDescartar: () => Promise<string | null> }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (ocupado) return <Loader2 size={15} className="animate-spin text-dim2" />;
  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-2 text-[11.5px]">
        <span className="text-dim">Erro de cadastro?</span>
        <button
          onClick={async () => {
            setOcupado(true);
            const e = await onDescartar();
            setOcupado(false);
            setConfirmando(false);
            setErro(e);
          }}
          className="font-semibold text-gold2 hover:text-gold"
        >
          Descartar
        </button>
        <button onClick={() => setConfirmando(false)} className="text-dim2 hover:text-tx">
          Cancelar
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {erro && <span className="text-[11px] text-yel">{erro}</span>}
      <button
        onClick={() => setConfirmando(true)}
        title="Foi erro (ex.: WhatsApp cadastrado errado): tira da lista, fica no registro"
        className="inline-flex items-center gap-1 px-2.5 py-[5px] rounded-[8px] text-[11.5px] font-semibold text-dim hover:text-tx border border-line2"
      >
        <X size={12} /> Descartar
      </button>
    </span>
  );
}
