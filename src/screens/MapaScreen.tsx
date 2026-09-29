// ─────────────────────────────────────────────────────────────
// Mapa de Frustração: onde roubo e devolução se concentram, por estado e
// por cidade — para decidir onde confirmar antes de enviar.
// ─────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react';
import { Check, FileUp, Loader2, MapPinned, PackageX, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatPercent } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { COR } from '@/lib/cores';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { ESTADOS, type LinhaRegiao, lerRegioesDoCsv, perdasPorRegiao } from '@/lib/regiao';

type Metrica = 'roubo' | 'frustracao';

/** Abaixo disso a porcentagem diz pouco: mostramos apagada. */
const POUCOS = 5;

const qtdDe = (l: LinhaRegiao, m: Metrica) => (m === 'roubo' ? l.roubos : l.frustrados);
const pctDe = (l: LinhaRegiao, m: Metrica) => (m === 'roubo' ? l.pct_roubo : l.pct_frustracao);

export function MapaScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, importarRegioes } = useData();
  const dados = useMemo(() => perdasPorRegiao(pedidos, periodo), [pedidos, periodo]);
  const [metrica, setMetrica] = useState<Metrica>('roubo');
  const [uf, setUf] = useState<string | null>(null);
  const faixa = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;

  const porUf = useMemo(() => new Map(dados.estados.map((e) => [e.uf, e])), [dados]);
  const maxPct = Math.max(0.0001, ...dados.estados.filter((e) => e.pedidos >= POUCOS).map((e) => pctDe(e, metrica)));
  const pior = [...dados.estados].sort((a, b) => qtdDe(b, metrica) - qtdDe(a, metrica))[0];
  const foco = (uf && porUf.get(uf)) || dados.brasil;
  const cidadesFoco = dados.cidades.filter((c) => !uf || c.uf === uf).slice(0, 10);
  const estadosOrdem = [...dados.estados].sort(
    (a, b) => qtdDe(b, metrica) - qtdDe(a, metrica) || pctDe(b, metrica) - pctDe(a, metrica),
  );

  // ── Importar regiões do CSV do BlueSales ──
  const arquivo = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  async function importar(f: File) {
    setAviso(null);
    setImportando(true);
    try {
      const { itens, linhas, semRegiao } = lerRegioesDoCsv(await f.text());
      if (itens.length === 0) throw new Error('Nenhum pedido com estado no arquivo.');
      const achados = await importarRegioes(itens);
      setAviso({
        ok: true,
        texto:
          `${achados} pedidos ganharam estado e cidade (de ${linhas} no arquivo` +
          `${semRegiao ? `; ${semRegiao} sem estado` : ''}). Só estado e cidade foram lidos — o resto do arquivo não saiu do seu computador.`,
      });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setImportando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  const nomeMetrica = metrica === 'roubo' ? 'roubo' : 'frustração';

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Mapa de Frustração</h1>
          <p className="text-[13px] text-dim mt-0.5">Onde roubo e devolução se concentram · pedidos agendados de {faixa}</p>
        </div>
        <input
          ref={arquivo}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
        />
        <button
          onClick={() => arquivo.current?.click()}
          disabled={importando}
          className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-60"
        >
          {importando ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          Importar regiões (CSV do BlueSales)
        </button>
      </div>

      {aviso && (
        <div
          className={`flex items-start gap-2.5 rounded-[12px] border px-4 py-3 text-[12.5px] text-dim ${
            aviso.ok ? 'border-grn/35 bg-grn/[0.06]' : 'border-yel/40 bg-yel/[0.07]'
          }`}
        >
          {aviso.ok ? <Check size={15} className="text-grn shrink-0 mt-[2px]" /> : <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />}
          {aviso.texto}
        </div>
      )}

      {dados.semRegiao > 0 && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line2 bg-card2 px-4 py-3 text-[12.5px] text-dim leading-relaxed">
          <MapPinned size={15} className="text-gold shrink-0 mt-[2px]" />
          <span>
            <b className="text-tx">{dados.semRegiao}</b> de {dados.total} pedidos do período ainda sem estado. No BlueSales, exporte{' '}
            <b className="text-tx">todas as etapas</b> do período e toque em <b className="text-tx">Importar regiões</b> — a
            dashboard lê só o número do pedido, a cidade e o estado.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
        <KpiCard
          Icon={MapPinned}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Pedidos com região"
          value={String(dados.brasil.pedidos)}
          sub={`de ${dados.total} agendados`}
        />
        <KpiCard
          Icon={ShieldAlert}
          color={COR.vermelho}
          label="Roubos"
          value={String(dados.brasil.roubos)}
          sub={`${formatPercent(dados.brasil.pct_roubo)} dos pedidos`}
        />
        <KpiCard
          Icon={PackageX}
          color={COR.vermelho}
          label="Frustração (tudo)"
          value={String(dados.brasil.frustrados)}
          sub={`${formatPercent(dados.brasil.pct_frustracao)} · perda ${formatBRL(dados.brasil.perda)}`}
        />
        <KpiCard
          Icon={TriangleAlert}
          color={COR.ambar}
          valueColor={COR.texto}
          label={`Estado com mais ${nomeMetrica}`}
          value={pior && qtdDe(pior, metrica) > 0 ? pior.uf : '—'}
          sub={pior && qtdDe(pior, metrica) > 0 ? `${qtdDe(pior, metrica)} de ${pior.pedidos} pedidos` : 'nenhum no período'}
        />
      </div>

      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Mapa em grade */}
        <Panel
          title="Mapa"
          right={
            <div className="flex gap-1 rounded-[10px] border border-line2 p-[3px]">
              {(['roubo', 'frustracao'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetrica(m)}
                  className={`px-3 py-[5px] rounded-[7px] text-[12px] font-semibold ${
                    metrica === m ? 'bg-chip text-tx' : 'text-dim hover:text-tx'
                  }`}
                >
                  {m === 'roubo' ? 'Roubo' : 'Frustração'}
                </button>
              ))}
            </div>
          }
        >
          <div className="p-3.5 lg:p-5">
            <div className="grid grid-cols-7 gap-[5px] lg:gap-2 max-w-[520px] mx-auto">
              {Object.entries(ESTADOS).map(([sigla, e]) => {
                const l = porUf.get(sigla);
                const pct = l ? pctDe(l, metrica) : 0;
                const qtd = l ? qtdDe(l, metrica) : 0;
                const poucos = !l || l.pedidos < POUCOS;
                const forca = l && qtd > 0 ? 0.12 + 0.7 * Math.min(1, pct / maxPct) : 0;
                const ativo = uf === sigla;
                return (
                  <button
                    key={sigla}
                    onClick={() => setUf(ativo ? null : sigla)}
                    title={`${e.nome}: ${l ? `${qtd} de ${l.pedidos} pedidos (${formatPercent(pct)})` : 'sem pedidos'}`}
                    style={{
                      gridColumn: e.col + 1,
                      gridRow: e.lin + 1,
                      backgroundColor: forca ? `rgba(251, 113, 133, ${forca.toFixed(2)})` : undefined,
                    }}
                    className={`aspect-square rounded-[8px] border flex flex-col items-center justify-center leading-none transition-colors ${
                      ativo ? 'border-gold ring-1 ring-gold' : l ? 'border-line2' : 'border-line/60 border-dashed'
                    } ${forca ? '' : l ? 'bg-card2' : ''}`}
                  >
                    <span className={`text-[11px] lg:text-[13px] font-extrabold ${l ? 'text-tx' : 'text-dim2'}`}>{sigla}</span>
                    {l && (
                      <span className={`mono text-[9px] lg:text-[10.5px] mt-[3px] ${poucos ? 'text-dim2' : 'text-tx2'}`}>
                        {qtd > 0 ? formatPercent(pct, 0) : '0'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-dim2">
              <span className="inline-flex items-center gap-2">
                <i className="inline-block h-[8px] w-[70px] rounded-full bg-gradient-to-r from-red/15 to-red/80" />
                % dos pedidos do estado com {nomeMetrica}
              </span>
              <span>número apagado = menos de {POUCOS} pedidos (pouco para concluir)</span>
              <span>toque num estado para ver as cidades</span>
            </div>
          </div>
        </Panel>

        {/* Detalhe: estado escolhido ou Brasil */}
        <Panel
          title={uf ? ESTADOS[uf]?.nome ?? uf : 'Brasil'}
          right={
            uf ? (
              <button onClick={() => setUf(null)} className="text-[12px] font-semibold text-gold2 hover:text-gold">
                ver Brasil
              </button>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-px bg-line border-b border-line">
            <Mini rotulo="Pedidos" valor={String(foco.pedidos)} />
            <Mini rotulo="Roubos" valor={`${foco.roubos} · ${formatPercent(foco.pct_roubo)}`} vermelho={foco.roubos > 0} />
            <Mini rotulo="Frustração (tudo)" valor={`${foco.frustrados} · ${formatPercent(foco.pct_frustracao)}`} vermelho={foco.frustrados > 0} />
            <Mini rotulo="Perda real" valor={formatBRL(foco.perda)} vermelho={foco.perda > 0} />
          </div>
          <div className="px-3.5 lg:px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-dim2">
            Cidades com mais {nomeMetrica}
          </div>
          {cidadesFoco.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-dim2">Nenhuma cidade com pedido no período.</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-3.5 lg:px-5 py-2">Cidade</th>
                  <th className="text-right font-semibold px-2 py-2">Pedidos</th>
                  <th className="text-right font-semibold px-2 py-2">Roubo</th>
                  <th className="text-right font-semibold px-3.5 lg:px-5 py-2">Frustr.</th>
                </tr>
              </thead>
              <tbody>
                {[...cidadesFoco]
                  .sort((a, b) => qtdDe(b, metrica) - qtdDe(a, metrica) || b.pedidos - a.pedidos)
                  .map((c) => (
                    <tr key={c.chave} className="border-t border-line/70">
                      <td className="px-3.5 lg:px-5 py-2.5">
                        <span className="text-tx font-medium">{c.cidade}</span>
                        {!uf && <span className="text-dim2"> · {c.uf}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right mono text-tx2">{c.pedidos}</td>
                      <td className={`px-2 py-2.5 text-right mono ${c.roubos ? 'text-red' : 'text-dim2'}`}>{c.roubos}</td>
                      <td className={`px-3.5 lg:px-5 py-2.5 text-right mono ${c.frustrados ? 'text-red' : 'text-dim2'}`}>
                        {c.frustrados}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Todos os estados */}
      <Panel title="Estados" hint={`ordenados por ${nomeMetrica}`}>
        {estadosOrdem.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-dim2">Nenhum pedido com estado no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-3.5 lg:px-5 py-2.5">Estado</th>
                  <th className="text-right font-semibold px-2 lg:px-3 py-2.5">Pedidos</th>
                  <th className="text-right font-semibold px-2 lg:px-3 py-2.5">Roubos</th>
                  <th className="hidden sm:table-cell text-right font-semibold px-3 py-2.5">% roubo</th>
                  <th className="text-right font-semibold px-2 lg:px-3 py-2.5">Frustr.</th>
                  <th className="hidden sm:table-cell text-right font-semibold px-3 py-2.5">% frustr.</th>
                  <th className="hidden md:table-cell text-right font-semibold px-3.5 lg:px-5 py-2.5">Perda real</th>
                </tr>
              </thead>
              <tbody>
                {estadosOrdem.map((e) => {
                  const poucos = e.pedidos < POUCOS;
                  return (
                    <tr
                      key={e.uf}
                      onClick={() => setUf(uf === e.uf ? null : e.uf)}
                      className={`border-t border-line/70 cursor-pointer hover:bg-white/[0.02] ${uf === e.uf ? 'bg-gold/[0.05]' : ''}`}
                    >
                      <td className="px-3.5 lg:px-5 py-2.5">
                        <span className="font-bold text-tx">{e.uf}</span>
                        <span className="text-dim2 hidden sm:inline"> · {ESTADOS[e.uf]?.nome}</span>
                      </td>
                      <td className="px-2 lg:px-3 py-2.5 text-right mono text-tx2">{e.pedidos}</td>
                      <td className={`px-2 lg:px-3 py-2.5 text-right mono ${e.roubos ? 'text-red' : 'text-dim2'}`}>{e.roubos}</td>
                      <td className={`hidden sm:table-cell px-3 py-2.5 text-right mono ${poucos ? 'text-dim2' : 'text-tx2'}`}>
                        {formatPercent(e.pct_roubo)}
                      </td>
                      <td className={`px-2 lg:px-3 py-2.5 text-right mono ${e.frustrados ? 'text-red' : 'text-dim2'}`}>{e.frustrados}</td>
                      <td className={`hidden sm:table-cell px-3 py-2.5 text-right mono ${poucos ? 'text-dim2' : 'text-tx2'}`}>
                        {formatPercent(e.pct_frustracao)}
                      </td>
                      <td className="hidden md:table-cell px-3.5 lg:px-5 py-2.5 text-right mono text-tx2">{formatBRL(e.perda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3.5 lg:px-5 py-3 border-t border-line text-[11px] text-dim2 leading-relaxed">
          Frustração = roubo, devolvido, voltando, aguardando devolução, cancelado e frustrado — o mesmo card de Frustrados.
          A porcentagem é sobre os pedidos agendados no estado; com menos de {POUCOS} pedidos ela fica apagada.
        </div>
      </Panel>
    </div>
  );
}

function Mini({ rotulo, valor, vermelho = false }: { rotulo: string; valor: string; vermelho?: boolean }) {
  return (
    <div className="bg-card px-3.5 lg:px-5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-dim2">{rotulo}</div>
      <div className={`mono text-[15px] font-extrabold mt-1 ${vermelho ? 'text-red' : 'text-tx'}`}>{valor}</div>
    </div>
  );
}
