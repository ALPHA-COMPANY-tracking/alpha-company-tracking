// ─────────────────────────────────────────────────────────────
// Mapa de Frustração: o mapa do Brasil pintado pelas perdas e, ao lado,
// os estados e cidades com mais roubo / frustração. Alimentado pelos
// pedidos que chegam do BlueSales (estado e cidade da entrega).
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { MapPin, MapPinned, PackageX, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatPercent } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { COR } from '@/lib/cores';
import { useData } from '@/store/DataProvider';
import { KpiCard } from '@/components/ui';
import { MapaBrasil, type ValorEstado } from '@/components/mapa/MapaBrasil';
import { ESTADOS, type LinhaRegiao, perdasPorRegiao } from '@/lib/regiao';

type Metrica = 'roubo' | 'frustracao';

const qtdDe = (l: LinhaRegiao, m: Metrica) => (m === 'roubo' ? l.roubos : l.frustrados);
const pctDe = (l: LinhaRegiao, m: Metrica) => (m === 'roubo' ? l.pct_roubo : l.pct_frustracao);

export function MapaScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos } = useData();
  const dados = useMemo(() => perdasPorRegiao(pedidos, periodo), [pedidos, periodo]);
  const [metrica, setMetrica] = useState<Metrica>('roubo');
  const [uf, setUf] = useState<string | null>(null);
  const faixa = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;
  const nomeMetrica = metrica === 'roubo' ? 'roubo' : 'frustração';
  const plural = metrica === 'roubo' ? 'roubos' : 'frustrações';

  const valores = useMemo(() => {
    const v: Record<string, ValorEstado> = {};
    for (const e of dados.estados) v[e.uf] = { qtd: qtdDe(e, metrica), pedidos: e.pedidos, pct: pctDe(e, metrica) };
    return v;
  }, [dados, metrica]);

  const ordem = (a: LinhaRegiao, b: LinhaRegiao) =>
    qtdDe(b, metrica) - qtdDe(a, metrica) || pctDe(b, metrica) - pctDe(a, metrica) || b.pedidos - a.pedidos;
  const estados = dados.estados.filter((e) => qtdDe(e, metrica) > 0).sort(ordem);
  const cidades = dados.cidades.filter((c) => (!uf || c.uf === uf) && qtdDe(c, metrica) > 0).sort(ordem).slice(0, 8);
  const foco = uf ? dados.estados.find((e) => e.uf === uf) : undefined;
  const pior = estados[0];

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Mapa de Frustração</h1>
        <p className="text-[13px] text-dim mt-0.5">Onde roubo e devolução se concentram · pedidos agendados de {faixa}</p>
      </div>

      {dados.semRegiao > 0 && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line2 bg-card2 px-4 py-3 text-[12.5px] text-dim leading-relaxed">
          <MapPinned size={15} className="text-gold shrink-0 mt-[2px]" />
          <span>
            <b className="text-tx">{dados.semRegiao}</b> de {dados.total} pedidos do período estão sem estado — o BlueSales não
            mandou o endereço deles. Ficam fora do mapa.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
        <KpiCard
          Icon={MapPinned}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Pedidos no mapa"
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
          value={pior ? pior.uf : '—'}
          sub={pior ? `${qtdDe(pior, metrica)} de ${pior.pedidos} pedidos` : 'nenhum no período'}
        />
      </div>

      <section className="bg-card border border-line rounded-card overflow-hidden">
        <div className="px-4 lg:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-[10px] border border-gold/30 bg-gold/10 text-gold">
              <MapPin size={17} />
            </span>
            <div>
              <h2 className="m-0 text-[14.5px] font-bold text-tx">Perdas por região</h2>
              <div className="text-[11.5px] text-dim2">Clique em um estado para ver as cidades</div>
            </div>
          </div>
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
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 lg:gap-5 p-3.5 lg:p-5">
          {/* Mapa */}
          <div className="rounded-[14px] border border-line bg-bg/40 p-3 lg:p-4">
            <MapaBrasil valores={valores} selecionado={uf} onSelecionar={setUf} nomeMetrica={plural} />
          </div>

          {/* Ranking */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="m-0 text-[15px] font-bold text-tx">
                  Ranking <span className="text-dim font-semibold">— Estados</span>
                </h3>
                <span className="text-[11px] text-dim2">mais {plural}</span>
              </div>
              {estados.length === 0 ? (
                <Vazio texto={`Nenhum ${nomeMetrica} no período.`} />
              ) : (
                <div className="flex flex-col gap-2 max-h-[330px] overflow-y-auto pr-0.5">
                  {estados.map((e, i) => (
                    <Item
                      key={e.uf}
                      pos={i + 1}
                      titulo={ESTADOS[e.uf]?.nome ?? e.uf}
                      sub={`${e.pedidos} pedidos · perda ${formatBRL(e.perda)}`}
                      qtd={qtdDe(e, metrica)}
                      rotulo={plural}
                      pct={pctDe(e, metrica)}
                      ativo={uf === e.uf}
                      onClick={() => setUf(uf === e.uf ? null : e.uf)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="m-0 text-[15px] font-bold text-tx">
                  Cidades <span className="text-dim font-semibold">— {foco ? ESTADOS[foco.uf]?.nome : 'Brasil'}</span>
                </h3>
                {uf ? (
                  <button onClick={() => setUf(null)} className="text-[11.5px] font-semibold text-gold2 hover:text-gold">
                    ver Brasil
                  </button>
                ) : (
                  <span className="text-[11px] text-dim2">mais {plural}</span>
                )}
              </div>
              {cidades.length === 0 ? (
                <Vazio texto={uf ? `Nenhum ${nomeMetrica} em ${ESTADOS[uf]?.nome ?? uf} no período.` : `Nenhum ${nomeMetrica} no período.`} />
              ) : (
                <div className="flex flex-col gap-2">
                  {cidades.map((c, i) => (
                    <Item
                      key={c.chave}
                      pos={i + 1}
                      titulo={`${c.cidade}`}
                      sub={`${c.uf} · ${c.pedidos} pedido${c.pedidos === 1 ? '' : 's'}`}
                      qtd={qtdDe(c, metrica)}
                      rotulo={plural}
                      pct={pctDe(c, metrica)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-5 py-3 border-t border-line text-[11px] text-dim2 leading-relaxed">
          Frustração = roubo, devolvido, voltando, aguardando devolução, cancelado e frustrado — o mesmo card de Frustrados.
          A cor do estado segue a quantidade; a porcentagem é sobre os pedidos agendados nele (com poucos pedidos, ela
          diz pouco).
        </div>
      </section>
    </div>
  );
}

function Item(p: {
  pos: number;
  titulo: string;
  sub: string;
  qtd: number;
  rotulo: string;
  pct: number;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const Tag = p.onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={p.onClick}
      className={`w-full text-left flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 transition-colors ${
        p.ativo ? 'border-gold/60 bg-gold/[0.06]' : 'border-line bg-card2/60'
      } ${p.onClick ? 'hover:border-line2 cursor-pointer' : ''}`}
    >
      <span className="w-5 text-center mono text-[13px] font-bold text-dim2">{p.pos}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-tx truncate">{p.titulo}</span>
        <span className="block text-[11px] text-dim2 truncate">{p.sub}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block mono text-[15px] font-extrabold text-red leading-tight">{p.qtd}</span>
        <span className="block text-[10.5px] text-dim2">
          {p.rotulo} · {formatPercent(p.pct, 0)}
        </span>
      </span>
    </Tag>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-dim2">{texto}</div>;
}
