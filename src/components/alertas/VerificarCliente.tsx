// Antes de agendar: CPF ou WhatsApp → a cliente já tem pedido aqui?
import { useState } from 'react';
import { Loader2, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatBRL, reaisToCents } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { type NivelAlerta, ROTULO_ALERTA, nivelDoAlerta } from '@/lib/clientes';
import { type PedidoVerificado, verificarCliente } from '@/lib/clientesApi';
import { situacaoDoPedido } from '@/lib/indicadores';
import { COR_ALERTA } from '@/components/alertas/SeloAlerta';

const campo =
  'w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-[13px] text-tx outline-none focus:border-gold/50 placeholder:text-dim2/70';

const FRASE: Record<NivelAlerta, string> = {
  roubo: 'Esta cliente já teve pedido ROUBADO. Não agende sem confirmar.',
  frustracao: 'Esta cliente já frustrou um pedido (devolveu, cancelou ou não pagou). Confirme antes de agendar.',
  duplicado: 'Esta cliente já tem um pedido EM ABERTO. Pode ser pedido duplicado.',
  whatsapp: 'Este WhatsApp já foi usado por OUTRA pessoa (outro CPF). Confirme quem é antes de agendar.',
  recompra: 'Cliente que já comprou e pagou. Pode agendar.',
};

/** "saiu_para_entrega" → "Saiu para entrega". */
function etapa(status: string | null): string {
  const s = (status ?? '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

export function VerificarCliente() {
  const [cpf, setCpf] = useState('');
  const [tel, setTel] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<PedidoVerificado[] | null>(null);

  async function verificar() {
    setErro(null);
    setRes(null);
    setOcupado(true);
    const r = await verificarCliente(cpf, tel);
    setOcupado(false);
    if (!r.ok) return setErro(r.aviso);
    setRes(r.pedidos);
  }

  const nivel = res ? nivelDoAlerta(res) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="block text-[10.5px] uppercase tracking-[0.1em] font-bold text-dim2 mb-[6px]">CPF</span>
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className={`${campo} mono`} />
        </label>
        <label className="block">
          <span className="block text-[10.5px] uppercase tracking-[0.1em] font-bold text-dim2 mb-[6px]">WhatsApp</span>
          <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="off" placeholder="(11) 99999-9999" className={`${campo} mono`} />
        </label>
        <button
          onClick={verificar}
          disabled={ocupado || (!cpf.trim() && !tel.trim())}
          className="inline-flex items-center justify-center gap-2 px-4 py-[10px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-50"
        >
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Verificar
        </button>
      </div>
      <p className="m-0 text-[11px] text-dim2 leading-snug">
        Preencha um dos dois (ou os dois). O CPF e o WhatsApp não ficam guardados — são comparados por um código.
      </p>

      {erro && (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-yel/40 bg-yel/[0.07] px-3.5 py-2.5 text-[12.5px] text-dim">
          <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
          {erro}
        </div>
      )}

      {res && (
        <div className="rounded-[12px] border border-line overflow-hidden">
          {nivel ? (
            <div className={`px-4 py-3 border-b border-line text-[13px] font-semibold ${COR_ALERTA[nivel]} border-x-0 border-t-0`}>
              {nivel === 'roubo' ? '🚨 ' : nivel === 'recompra' ? '' : '⚠️ '}
              {ROTULO_ALERTA[nivel]} — {FRASE[nivel]}
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2 text-[13px] font-semibold text-grn bg-grn/10">
              <ShieldCheck size={16} /> Nenhum pedido anterior com esse CPF / WhatsApp. Pode agendar.
            </div>
          )}
          {res.map((p, i) => {
            const s = situacaoDoPedido(p.status);
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-line/70 first:border-t-0 text-[12.5px]">
                <span className="mono text-tx font-semibold w-[58px]">#{p.numero ?? '—'}</span>
                <span className="text-dim w-[48px]">{formatDiaMes(p.data)}</span>
                <span className={`flex-1 min-w-0 truncate ${s === 'frustracao' ? 'text-red' : s === 'pago' ? 'text-grn' : 'text-tx2'}`}>
                  {etapa(p.status)}
                  {p.vendedor && <span className="text-dim2"> · {p.vendedor}</span>}
                </span>
                <span className="hidden sm:inline text-[11px] text-dim2">{p.por === 'cpf' ? 'CPF' : 'WhatsApp'}</span>
                <span className="mono text-tx w-[84px] text-right">{formatBRL(reaisToCents(p.valor))}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
