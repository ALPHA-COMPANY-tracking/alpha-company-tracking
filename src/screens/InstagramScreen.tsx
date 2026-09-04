import { useMemo } from 'react';
import { Flame, ShoppingCart, TrendingUp, Wallet, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact } from '@/lib/money';
import { hojeIso } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { rankingVendedores } from '@/lib/ranking';
import { useData } from '@/store/DataProvider';
import { LogoMark } from '@/components/Logo';
import { Panel } from '@/components/ui';
import { BarsVertical } from '@/components/viz/BarsVertical';

/** 'YYYY-MM-DD' → 'DD/MM'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Como o período aparece ao lado de cada título: "(Hoje)", "(03/09)"... */
function rotuloPeriodo(p: Periodo): string {
  const hoje = hojeIso();
  if (p.inicio === p.fim) return p.inicio === hoje ? 'Hoje' : diaMes(p.inicio);
  if (p.fim === hoje) return `${diaMes(p.inicio)} a hoje`;
  return `${diaMes(p.inicio)} a ${diaMes(p.fim)}`;
}

/** Cartão do print: número grande, borda colorida, nada de operação. */
function Cartao({
  Icon,
  cor,
  label,
  valor,
  destaque = false,
}: {
  Icon: LucideIcon;
  cor: string;
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className="bg-card border rounded-card flex items-center gap-3 lg:gap-4"
      style={{
        borderColor: `${cor}55`,
        boxShadow: `inset 0 0 0 1px ${cor}14`,
        padding: destaque ? '20px 22px' : '15px 18px',
      }}
    >
      <span
        className="grid place-items-center shrink-0 rounded-[13px]"
        style={{
          background: `${cor}1f`,
          color: cor,
          width: destaque ? 52 : 42,
          height: destaque ? 52 : 42,
        }}
      >
        <Icon size={destaque ? 25 : 20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className={`text-dim font-medium ${destaque ? 'text-[13px]' : 'text-[12px]'}`}>{label}</div>
        <div
          className="mono font-extrabold tracking-tight leading-tight truncate"
          style={{ color: cor, fontSize: destaque ? 34 : 24 }}
        >
          {valor}
        </div>
      </div>
    </div>
  );
}

export function InstagramScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, pedidos } = useData();

  const pnl = useMemo(
    () => calcularPnl(dailies, custos, periodo, { descontarFrustrados: 'real' }, pedidos),
    [dailies, custos, periodo, pedidos],
  );
  const ranking = useMemo(() => rankingVendedores(pedidos, dailies, periodo), [pedidos, dailies, periodo]);

  const quando = rotuloPeriodo(periodo);

  const porQtd = ranking
    .filter((l) => l.qtd_agendados > 0)
    .sort((a, b) => b.qtd_agendados - a.qtd_agendados)
    .map((l) => ({ label: l.nome, value: l.qtd_agendados, display: String(l.qtd_agendados) }));

  const porValor = ranking
    .filter((l) => l.agendado > 0)
    .sort((a, b) => b.agendado - a.agendado)
    .map((l) => ({ label: l.nome, value: l.agendado, display: formatBRLCompact(l.agendado) }));

  const semDados = pnl.qtd_agendados === 0;

  return (
    <div className="flex flex-col gap-3.5 lg:gap-4 w-full">
      {/* Cabeçalho da postagem: marca + período, e nada mais */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <LogoMark size={36} />
          <div>
            <div className="text-gold-metal font-extrabold text-[14px] tracking-[0.05em] leading-none">
              AJ ALPHA COMPANY
            </div>
            <div className="text-[11px] text-dim2 mt-[3px]">Resultado · {quando}</div>
          </div>
        </div>
        <span className="text-[10.5px] uppercase tracking-wide font-bold text-grn border border-grn/35 bg-grn/10 rounded-full px-[9px] py-[3px]">
          ● Ao vivo
        </span>
      </div>

      {semDados ? (
        <Panel>
          <div className="p-10 text-center">
            <div className="text-[15px] font-semibold text-tx mb-2">Nenhum agendamento neste período</div>
            <div className="text-[13px] text-dim">Escolha outro período no topo para montar o print.</div>
          </div>
        </Panel>
      ) : (
        <>
          {/* O número principal */}
          <Cartao
            Icon={TrendingUp}
            cor="#34d399"
            label={`Faturamento Agendado (${quando})`}
            valor={formatBRL(pnl.valor_agendado)}
            destaque
          />

          {/* Os quatro de apoio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 lg:gap-3.5">
            <Cartao
              Icon={Wallet}
              cor="#4ade80"
              label={`Lucro Projetado (${quando})`}
              valor={formatBRL(pnl.lucro_agendado)}
            />
            <Cartao
              Icon={Flame}
              cor="#fb7185"
              label={`Tráfego (${quando})`}
              valor={formatBRL(pnl.investimento_ads)}
            />
            <Cartao
              Icon={ShoppingCart}
              cor="#c084fc"
              label={`Total de Pedidos (${quando})`}
              valor={String(pnl.qtd_agendados)}
            />
            <Cartao Icon={Zap} cor="#60a5fa" label={`CPA (${quando})`} valor={formatBRL(pnl.cpa)} />
          </div>

          {/* Os dois gráficos por atendente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            <Panel title={`Agendamentos por Atendente (${quando})`}>
              <BarsVertical data={porQtd} gradId="ig-qtd" altura={230} />
            </Panel>
            <Panel title={`Valor Agendado por Atendente (${quando})`}>
              <BarsVertical data={porValor} gradId="ig-valor" altura={230} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
