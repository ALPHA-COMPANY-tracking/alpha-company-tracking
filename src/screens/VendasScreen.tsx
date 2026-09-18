import { useMemo, useState } from 'react';
import { Copy, RotateCcw, Search, ShoppingBag, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Pedido, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { agendadoPorDia, casaComBusca, possiveisDuplicados, statusBucket } from '@/lib/pedidos';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';

/** 'YYYY-MM-DD' → 'DD/MM'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Resumo do plano: "6 potes" / "3 potes". */
function planoCurto(plano?: string | null): string {
  // Lê a quantidade do próprio texto: plano novo no BlueSales já aparece
  // certo aqui, sem precisar de mais uma linha de código.
  const m = /(\d+)\s*pote/i.exec(plano ?? '');
  if (!m) return (plano ?? '').trim() || '—';
  return `${m[1]} pote${m[1] === '1' ? '' : 's'}`;
}

/** Como o status aparece na tela, com a cor do que ele significa. */
function selo(p: Pedido): { texto: string; classe: string } {
  const bucket = statusBucket(p.status);
  const cru = (p.status ?? '').replace(/_/g, ' ');
  if (bucket === 'aprovado') return { texto: 'Pago', classe: 'text-grn border-grn/35 bg-grn/10' };
  if (bucket === 'frustrado') return { texto: 'Frustrado', classe: 'text-red border-red/35 bg-red/10' };
  return { texto: cru || 'agendado', classe: 'text-dim border-line2 bg-chip' };
}

export function VendasScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, removerPedido, definirClientePedido } = useData();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  function salvarNome(id: string) {
    const nome = rascunho.trim();
    definirClientePedido(id, nome || null);
    setEditando(null);
  }

  // Pela data de CRIAÇÃO: é a lista do que foi agendado no período,
  // independente de já ter sido pago.
  const doPeriodo = useMemo(
    () =>
      pedidos
        .filter((p) => isDentro(p.data, periodo.inicio, periodo.fim))
        // Dentro do dia, pela numeração do BlueSales (#528, #529...):
        // é a ordem cronológica e a mesma que aparece lá.
        .sort(
          (a, b) =>
            b.data.localeCompare(a.data) ||
            (b.internal_id ?? 0) - (a.internal_id ?? 0) ||
            a.id.localeCompare(b.id),
        ),
    [pedidos, periodo],
  );

  const ativos = doPeriodo.filter((p) => !p.removido_em);
  const removidos = doPeriodo.filter((p) => p.removido_em);

  // Busca: procura em TODAS as datas (a venda que se procura muitas vezes
  // é de outro mês), inclusive nas excluídas — para dar para devolver.
  const [busca, setBusca] = useState('');
  const buscando = busca.trim().length > 0;
  const achados = useMemo(
    () =>
      buscando
        ? pedidos
            .filter((p) => casaComBusca(p, busca))
            .sort((a, b) => b.data.localeCompare(a.data) || (b.internal_id ?? 0) - (a.internal_id ?? 0))
        : [],
    [pedidos, busca, buscando],
  );
  const listaAtivos = buscando ? achados.filter((p) => !p.removido_em) : ativos;
  const listaRemovidos = buscando ? achados.filter((p) => p.removido_em) : removidos;

  const totalAtivo = ativos.reduce((s, p) => s + (Number(p.valor_agendado ?? p.valor) || 0), 0);
  const pagos = ativos.filter((p) => statusBucket(p.status) === 'aprovado').length;

  // Conferência: onde está a venda que o BlueSales não conta mais.
  const duplicados = useMemo(() => possiveisDuplicados(pedidos, periodo), [pedidos, periodo]);
  const porDia = useMemo(() => agendadoPorDia(pedidos, periodo), [pedidos, periodo]);

  /** Lixeira com confirmação, a mesma da tabela. */
  function lixeira(p: Pedido) {
    if (confirmando === p.id) {
      return (
        <div className="inline-flex items-center gap-1.5">
          <button
            onClick={() => {
              removerPedido(p.id, true);
              setConfirmando(null);
            }}
            className="px-2.5 py-[5px] rounded-lg text-[11.5px] font-semibold text-red border border-red/40 bg-red/10 hover:bg-red/20"
          >
            Excluir
          </button>
          <button onClick={() => setConfirmando(null)} className="px-2.5 py-[5px] rounded-lg text-[11.5px] text-dim2 hover:text-tx">
            Não
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setConfirmando(p.id)}
        title="Tirar esta venda da plataforma"
        className="grid place-items-center w-8 h-8 rounded-lg text-red/70 hover:text-red hover:bg-red/10"
      >
        <Trash2 size={15} />
      </button>
    );
  }

  function linha(p: Pedido, removido: boolean) {
    const s = selo(p);
    const valor = Number(p.valor_agendado ?? p.valor) || 0;
    return (
      <tr key={p.id} className={`border-t border-line/70 hover:bg-white/[0.015] ${removido ? 'opacity-55' : ''}`}>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-tx font-medium whitespace-nowrap">{diaMes(p.data)}</td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4">
          {/* O nome chega sozinho nas vendas novas. Nas antigas não há de
              onde tirar — o log descarta o bloco do cliente —, então dá
              para escrever aqui, clicando no nome. */}
          {editando === p.id ? (
            <input
              autoFocus
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onBlur={() => salvarNome(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarNome(p.id);
                if (e.key === 'Escape') setEditando(null);
              }}
              placeholder="Nome do cliente"
              className="w-[150px] sm:w-[220px] lg:w-[340px] bg-card2 border border-gold/50 rounded-[8px] px-2 py-[5px] text-[12.5px] text-tx outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setRascunho(p.cliente ?? '');
                setEditando(p.id);
              }}
              title="Clique para escrever o nome"
              className={`block text-left truncate max-w-[125px] sm:max-w-[220px] lg:max-w-[340px] hover:text-gold transition-colors ${
                p.cliente ? 'text-tx' : 'text-dim2 italic'
              }`}
            >
              {p.cliente ?? 'escrever nome'}
            </button>
          )}
          {/* O número do BlueSales (#528) é o que aparece na lista de lá —
              é por ele que se casa uma venda daqui com uma de lá. */}
          <div className="text-[10px] mono mt-[2px]">
            {p.internal_id != null && <span className="text-dim font-bold">#{p.internal_id}</span>}
            <span className="hidden sm:inline text-dim2">{p.internal_id != null ? " · " : ""}{p.id}</span>
          </div>
        </td>
        <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-dim">{p.vendedor?.trim() || '—'}</td>
        <td className="hidden md:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-dim">{planoCurto(p.produto_plano)}</td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right">
          <span className={`mono font-bold ${removido ? 'text-dim2 line-through' : 'text-gold2'}`}>
            {formatBRL(reaisToCents(valor))}
          </span>
        </td>
        <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4">
          <span className={`text-[10.5px] border rounded-full px-[8px] py-[2px] whitespace-nowrap ${s.classe}`}>
            {s.texto}
          </span>
        </td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right whitespace-nowrap">
          {removido ? (
            <button
              onClick={() => removerPedido(p.id, false)}
              title="Devolver esta venda para a plataforma"
              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-gold hover:bg-gold/10 ml-auto"
            >
              <RotateCcw size={14} />
            </button>
          ) : (
            // Tirar uma venda mexe no faturamento: pede confirmação.
            <div className="flex justify-end">{lixeira(p)}</div>
          )}
        </td>
      </tr>
    );
  }

  const cabecalho = (
    <thead>
      <tr className="text-dim2 text-[11px] uppercase tracking-wide">
        <th className="text-left font-semibold px-2 sm:px-3 lg:px-5 py-3">Data</th>
        <th className="text-left font-semibold px-3 lg:px-5 py-3">Cliente</th>
        <th className="hidden sm:table-cell text-left font-semibold px-3 lg:px-5 py-3">Vendedor</th>
        <th className="hidden md:table-cell text-left font-semibold px-3 lg:px-5 py-3">Plano</th>
        <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Valor</th>
        <th className="hidden sm:table-cell text-left font-semibold px-3 lg:px-5 py-3">Status</th>
        <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Ações</th>
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Vendas Agendadas</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Tudo que foi agendado no período, com o nome do cliente — e o que tirar da plataforma
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 lg:gap-[14px]">
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Agendadas</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-gold2">{ativos.length}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">no período</div>
        </div>
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Valor agendado</div>
          <div className="mono text-[13px] lg:text-[21px] font-extrabold text-gold2 truncate">
            {formatBRL(reaisToCents(totalAtivo))}
          </div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">{pagos} já pagas</div>
        </div>
        <div className={`bg-card border rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px] ${removidos.length > 0 ? 'border-red/30' : 'border-line'}`}>
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Excluídas</div>
          <div className={`mono text-[16px] lg:text-[21px] font-extrabold ${removidos.length > 0 ? 'text-red' : 'text-dim'}`}>
            {removidos.length}
          </div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">fora dos cálculos</div>
        </div>
      </div>

      {/* Busca em todas as datas — logo no topo, que é onde se procura. */}
      <label className="flex items-center gap-2.5 bg-card border border-line2 focus-within:border-gold/60 rounded-[12px] px-3.5 py-2.5 transition-colors">
        <Search size={16} className="text-gold shrink-0" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar venda por nome do cliente, #número ou código BLV"
          className="flex-1 min-w-0 bg-transparent text-[13.5px] text-tx placeholder:text-dim2 outline-none"
        />
        {buscando && (
          <button onClick={() => setBusca('')} title="Limpar busca" className="text-dim2 hover:text-tx shrink-0">
            <X size={16} />
          </button>
        )}
      </label>

      {/* Conferir com o BlueSales — primeiro o que dá para apontar sozinho. */}
      {!buscando && (
        <Panel
          title="Conferir com o BlueSales"
          hint={duplicados.length > 0 ? `${duplicados.length} cliente${duplicados.length === 1 ? '' : 's'} com mais de um pedido` : 'nenhum cliente repetido'}
        >
          <div className="p-4 lg:p-5 flex flex-col gap-4">
            {duplicados.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-[12.5px] text-dim leading-relaxed">
                  <b className="text-tx">Possíveis duplicados.</b> O mesmo cliente com mais de um pedido costuma ser venda
                  refeita: o vendedor criou de novo e excluiu a antiga no BlueSales — que continua aqui. Procure o
                  #número no BlueSales e só tire o que <b className="text-tx">não existir mais lá</b>.
                </p>
                {duplicados.map((g) => (
                  <div key={g[0].id} className="rounded-[12px] border border-yel/30 bg-yel/[0.04] overflow-hidden">
                    <div className="px-3.5 py-2 text-[12.5px] font-semibold text-tx border-b border-yel/20 flex items-center gap-2">
                      <Copy size={13} className="text-yel shrink-0" />
                      <span className="truncate">{g[0].cliente}</span>
                      <span className="text-[10.5px] text-dim2 font-normal shrink-0">{g.length} pedidos</span>
                    </div>
                    {g.some((p) => statusBucket(p.status) === 'frustrado') && (
                      <div className="px-3.5 py-2 text-[11.5px] text-yel/90 bg-yel/[0.05] border-b border-yel/20">
                        Tem um frustrado: pode ser <b>recompra</b> (a entrega falhou e ela comprou de novo) — aí as duas vendas
                        são reais. Só apague se o pedido não existir mais no BlueSales.
                      </div>
                    )}
                    <div className="divide-y divide-line/70">
                      {g.map((p) => {
                        const s = selo(p);
                        return (
                          <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px]">
                              <span className="mono font-bold text-dim">#{p.internal_id ?? '—'}</span>
                              <span className="text-tx">{diaMes(p.data)}</span>
                              <span className="text-dim">{planoCurto(p.produto_plano)}</span>
                              <span className="text-dim">{p.vendedor?.trim() || '—'}</span>
                              <span className={`text-[10.5px] border rounded-full px-[8px] py-[1px] whitespace-nowrap ${s.classe}`}>{s.texto}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="mono font-bold text-gold2 text-[12.5px]">
                                {formatBRL(reaisToCents(Number(p.valor_agendado ?? p.valor) || 0))}
                              </span>
                              {lixeira(p)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[12.5px] text-dim leading-relaxed">
                <b className="text-tx">Nenhum cliente com dois pedidos</b> neste período. Se o total não bate com o
                BlueSales, compare o agendado de cada dia abaixo com o gráfico de lá (passe o mouse em cima do dia): o dia
                que não bate é onde está a venda a mais.
              </p>
            )}

            {porDia.length > 0 && (
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-dim2 mb-2">Agendado por dia</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {porDia.map((d) => (
                    <div key={d.data} className="rounded-[10px] border border-line bg-card2 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-semibold text-tx">{diaMes(d.data)}</span>
                        <span className="text-[10.5px] text-dim2">
                          {d.qtd} venda{d.qtd === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mono text-[13px] font-bold text-gold2 mt-0.5">{formatBRL(reaisToCents(d.valor))}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel
        title={buscando ? 'Resultado da busca' : 'Vendas do período'}
        hint={
          buscando
            ? `${achados.length} encontrada${achados.length === 1 ? '' : 's'} · em todas as datas`
            : 'a lixeira tira a venda de todos os cálculos'
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[335px] lg:min-w-[720px]">
            {cabecalho}
            <tbody>
              {listaAtivos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-dim2">
                    {buscando
                      ? listaRemovidos.length > 0
                        ? 'Só aparece entre as excluídas, logo abaixo.'
                        : 'Nenhuma venda encontrada com esse nome ou número.'
                      : 'Nenhuma venda agendada neste período.'}
                  </td>
                </tr>
              ) : (
                listaAtivos.map((p) => linha(p, false))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {listaRemovidos.length > 0 && (
        <Panel title="Excluídas da plataforma" hint="não entram em nenhum cálculo · a seta devolve">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[420px] lg:min-w-[720px]">
              {cabecalho}
              <tbody>{listaRemovidos.map((p) => linha(p, true))}</tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <TriangleAlert size={16} className="text-yel shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          Use a lixeira quando a venda foi <b className="text-dim">cancelada e excluída no BlueSales</b>. Nesse caso ele
          não manda evento nenhum — o pedido some de lá e ficaria preso aqui, inflando o Faturamento Agendado. Nada é
          apagado do banco: a venda vai para a lista de baixo e pode voltar.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <ShoppingBag size={16} className="text-gold shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          Nas vendas novas o nome entra sozinho. Nas anteriores a <b className="text-dim">03/09/2026</b> não há de onde
          tirar — nenhum dado do cliente era guardado até então. Clique em <b className="text-dim">escrever nome</b> para
          preencher à mão; case pelo <b className="text-dim">#número</b>, que é o mesmo do BlueSales.
        </p>
      </div>
    </div>
  );
}
