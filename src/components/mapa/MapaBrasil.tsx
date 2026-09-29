// ─────────────────────────────────────────────────────────────
// Mapa do Brasil por estado, pintado pela quantidade de perdas.
// Contorno dos estados: svg-maps/brazil (CC BY 4.0) — o crédito aparece
// no canto do mapa, como a licença pede.
// ─────────────────────────────────────────────────────────────

import { useLayoutEffect, useRef, useState } from 'react';
import brasilSvg from '@svg-maps/brazil';
import { formatPercent } from '@/lib/money';
import { ESTADOS } from '@/lib/regiao';

interface Local {
  id: string;
  name: string;
  path: string;
}
const brasil = brasilSvg as unknown as { viewBox: string; locations: Local[] };

export interface ValorEstado {
  qtd: number;
  pedidos: number;
  pct: number;
}

// Estados pequenos demais para a sigla caber dentro: ela vai do lado.
const SIGLA_FORA = new Set(['RN', 'PB', 'PE', 'AL', 'SE', 'ES', 'RJ']);

/** Vermelho da marca (perda), mais forte quanto mais perto do máximo. */
function corDe(v: ValorEstado | undefined, max: number): string {
  if (!v || v.pedidos === 0) return 'rgb(var(--line))';
  if (v.qtd === 0) return 'rgb(var(--dim2) / 0.45)';
  const f = 0.3 + 0.65 * Math.min(1, v.qtd / Math.max(1, max));
  return `rgba(251, 113, 133, ${f.toFixed(2)})`;
}

export function MapaBrasil({
  valores,
  selecionado,
  onSelecionar,
  nomeMetrica,
}: {
  valores: Record<string, ValorEstado>;
  selecionado: string | null;
  onSelecionar: (uf: string | null) => void;
  /** "roubo" ou "frustração" — para o texto do destaque. */
  nomeMetrica: string;
}) {
  const max = Math.max(0, ...Object.values(valores).map((v) => v.qtd));
  const [sobre, setSobre] = useState<string | null>(null);

  // Onde vai a sigla de cada estado: o centro do desenho, medido depois
  // que o SVG existe na tela.
  const caminhos = useRef<Record<string, SVGPathElement | null>>({});
  const [siglas, setSiglas] = useState<Record<string, { x: number; y: number; fora: boolean }>>({});
  useLayoutEffect(() => {
    const pos: Record<string, { x: number; y: number; fora: boolean }> = {};
    for (const [uf, el] of Object.entries(caminhos.current)) {
      if (!el) continue;
      const b = el.getBBox();
      const fora = SIGLA_FORA.has(uf);
      pos[uf] = fora ? { x: b.x + b.width + 4, y: b.y + b.height / 2, fora } : { x: b.x + b.width / 2, y: b.y + b.height / 2, fora };
    }
    // Ajustes à mão onde o centro da caixa cai fora do estado.
    if (pos.PA) pos.PA.y += 18;
    if (pos.MA) pos.MA.x += 6;
    if (pos.GO) pos.GO.y += 8;
    setSiglas(pos);
  }, []);

  const destaque = sobre ?? selecionado;
  const info = destaque ? valores[destaque] : undefined;

  return (
    <div className="relative">
      {/* Estado sob o dedo/mouse (ou o escolhido) */}
      <div className="min-h-[38px] text-[12px] text-dim leading-snug">
        {destaque ? (
          <>
            <b className="text-tx">{ESTADOS[destaque]?.nome ?? destaque}</b>
            {info && info.pedidos > 0 ? (
              <>
                {' '}
                · <b className={info.qtd ? 'text-red' : 'text-tx2'}>{info.qtd}</b> {nomeMetrica} de {info.pedidos} pedidos (
                {formatPercent(info.pct)})
              </>
            ) : (
              ' · sem pedidos no período'
            )}
          </>
        ) : (
          'Passe o mouse ou toque num estado'
        )}
      </div>

      <div className="flex items-end gap-3">
        <svg viewBox={brasil.viewBox} className="w-full max-h-[520px] flex-1" role="img" aria-label={`Mapa do Brasil por ${nomeMetrica}`}>
          {brasil.locations.map((l) => {
            const uf = l.id.toUpperCase();
            const ativo = selecionado === uf;
            return (
              <path
                key={uf}
                ref={(el) => {
                  caminhos.current[uf] = el;
                }}
                d={l.path}
                onClick={() => onSelecionar(ativo ? null : uf)}
                onMouseEnter={() => setSobre(uf)}
                onMouseLeave={() => setSobre(null)}
                style={{
                  fill: corDe(valores[uf], max),
                  stroke: ativo ? 'rgb(var(--gold))' : sobre === uf ? 'rgb(var(--gold2))' : 'rgb(var(--bg))',
                  strokeWidth: ativo ? 2.2 : sobre === uf ? 1.6 : 1.1,
                  cursor: 'pointer',
                  transition: 'fill .2s',
                }}
              />
            );
          })}
          {/* O estado escolhido por cima, para a borda dourada não sumir sob os vizinhos */}
          {selecionado && brasil.locations.find((l) => l.id.toUpperCase() === selecionado) && (
            <path
              d={brasil.locations.find((l) => l.id.toUpperCase() === selecionado)!.path}
              style={{ fill: 'none', stroke: 'rgb(var(--gold))', strokeWidth: 2.2, pointerEvents: 'none' }}
            />
          )}
          {Object.entries(siglas).map(([uf, p]) => (
            <text
              key={uf}
              x={p.x}
              y={p.y}
              textAnchor={p.fora ? 'start' : 'middle'}
              dominantBaseline="central"
              style={{
                fontSize: p.fora || uf === 'DF' ? 9 : 11.5,
                fontWeight: 700,
                fill: 'rgb(var(--tx))',
                pointerEvents: 'none',
                paintOrder: 'stroke',
                stroke: 'rgb(var(--bg) / 0.55)',
                strokeWidth: 2.5,
              }}
            >
              {uf}
            </text>
          ))}
        </svg>

        {/* Legenda */}
        <div className="shrink-0 flex flex-col items-center gap-1 text-[10px] text-dim2 pb-2">
          <span>Alto</span>
          <span className="mono text-tx2">{max}</span>
          <i className="block w-[8px] h-[120px] rounded-full bg-gradient-to-b from-red/95 to-red/30" />
          <span className="mono text-tx2">0</span>
          <span>Baixo</span>
        </div>
      </div>
      <div className="text-right text-[9.5px] text-dim2 mt-1">Mapa: svg-maps/brazil (CC BY 4.0)</div>
    </div>
  );
}
