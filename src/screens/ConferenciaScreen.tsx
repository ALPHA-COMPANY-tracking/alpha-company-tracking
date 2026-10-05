// ─────────────────────────────────────────────────────────────
// Conferência da Planilha: "[PayAfter] Pagamentos Aprovados" × dashboard.
// A planilha manda os pagamentos sozinha, de hora em hora (Apps Script);
// o servidor corrige o que é seguro e o resto aparece aqui, com o botão
// "Usar o da planilha". A planilha é a verdade.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, FileSpreadsheet, LayoutDashboard, Loader2, TriangleAlert } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { supabase } from '@/lib/supabase';
import { KpiCard, Panel } from '@/components/ui';
import { COR } from '@/lib/cores';
import { formatBRL, reaisToCents } from '@/lib/money';
import { haQuanto } from '@/lib/saudacao';
import { competencias, conferirMes, type Diferenca, type TipoDiferenca } from '../../api/lib-planilha';
import {
  type AjusteFeito,
  type FotoPlanilha,
  carregarAjustes,
  carregarPlanilha,
  scriptDaPlanilha,
  usarDaPlanilha,
} from '@/lib/planilhaConferencia';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const brl = (n: number) => formatBRL(reaisToCents(n));
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Mais grave primeiro. */
const ORDEM: TipoDiferenca[] = ['falta', 'nao_pago', 'a_mais', 'valor', 'vendedor', 'data', 'repetido'];

const TIPO: Record<TipoDiferenca, { rotulo: string; cor: 'red' | 'yel'; explica: string }> = {
  falta: { rotulo: 'Falta na dashboard', cor: 'red', explica: 'Está na planilha e não aparece aqui (ou foi tirado da plataforma). Confira no BlueSales.' },
  nao_pago: { rotulo: 'Pago só na planilha', cor: 'red', explica: 'A planilha diz que pagou; aqui o pedido ainda não está como pago. Marque como pago no BlueSales.' },
  a_mais: { rotulo: 'Pago só na dashboard', cor: 'red', explica: 'Pago aqui e não está na planilha. Se não entrou dinheiro, tire da plataforma na tela Vendas.' },
  valor: { rotulo: 'Valor diferente', cor: 'yel', explica: 'Não foi corrigido sozinho: valor acima do que o pedido já teve, ou vendedor diferente.' },
  vendedor: { rotulo: 'Vendedor diferente', cor: 'yel', explica: 'Muda a comissão dos dois vendedores. Confira antes de usar o da planilha.' },
  data: { rotulo: 'Data diferente', cor: 'yel', explica: 'Não foi corrigida sozinha (vendedor diferente?).' },
  repetido: { rotulo: 'Repetido na planilha', cor: 'yel', explica: 'O mesmo pedido em mais de uma linha (pagamento em partes?). Não é corrigido sozinho.' },
};

const CAMPO: Record<string, string> = { valor: 'Valor', data_aprovacao: 'Data de pagamento', vendedor: 'Vendedor' };
function valorDoCampo(campo: string, v: string | null): string {
  if (v == null || v === '') return '—';
  if (campo === 'valor') return brl(Number(v) || 0);
  if (campo === 'data_aprovacao' && /^\d{4}-\d{2}-\d{2}/.test(v)) return dm(v);
  return v;
}

export function ConferenciaScreen() {
  const { pedidos, recarregar } = useData();
  // undefined = carregando; null = migração 0027 não rodada.
  const [foto, setFoto] = useState<FotoPlanilha | null | undefined>(undefined);
  const [ajustes, setAjustes] = useState<AjusteFeito[]>([]);
  const [conta, setConta] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(async () => {
    const [f, a] = await Promise.all([carregarPlanilha(), carregarAjustes()]);
    setFoto(f);
    setAjustes(a);
    setAgora(Date.now());
  }, []);
  useEffect(() => {
    supabase?.rpc('conta_do_usuario').then(({ data }) => setConta(typeof data === 'string' ? data : null));
    carregar();
    const t = setInterval(carregar, 5 * 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  const meses = useMemo(() => (foto ? [...new Set(competencias(foto.linhas).values())].sort().reverse() : []), [foto]);
  const [mesEscolhido, setMes] = useState<string | null>(null);
  const mes = mesEscolhido && meses.includes(mesEscolhido) ? mesEscolhido : (meses[0] ?? null);
  const conf = useMemo(() => (foto && mes ? conferirMes(mes, foto.linhas, pedidos) : null), [foto, mes, pedidos]);
  const porId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos]);
  const diferencas = useMemo(
    () => (conf ? [...conf.diferencas].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo)) : []),
    [conf],
  );

  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function corrigir(d: Diferenca) {
    if (!conta) return setErro('Ainda carregando — tente de novo em alguns segundos.');
    setErro(null);
    setCorrigindo(`${d.tipo}:${d.pedido_id}`);
    const e = await usarDaPlanilha(conta, d);
    if (e) setErro(e);
    await Promise.all([recarregar(), carregar()]);
    setCorrigindo(null);
  }

  const nunca = foto != null && foto.recebidoEm == null;
  const atrasada = foto?.recebidoEm != null && agora - new Date(foto.recebidoEm).getTime() > 3 * 3_600_000;
  const abas = foto ? new Set(foto.linhas.map((l) => l.aba)).size : 0;
  const vendedores = conf
    ? [...new Set([...Object.keys(conf.planilha.porVendedor), ...Object.keys(conf.dashboard.porVendedor)])].sort()
    : [];
  const diferencaTotal = conf ? Math.round((conf.dashboard.total - conf.planilha.total) * 100) / 100 : 0;
  const bate = conf != null && diferencaTotal === 0 && diferencas.length === 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Conferência da Planilha</h1>
        <p className="text-[13px] text-dim mt-0.5">
          A planilha de pagamentos é a verdade: ela manda os pagamentos sozinha, de hora em hora, e o que é seguro a dashboard corrige na hora
        </p>
      </div>

      {/* Situação do envio */}
      <div
        className={`rounded-card border px-4 lg:px-5 py-3 flex items-center gap-2.5 text-[13px] ${
          foto === null || nunca || atrasada ? 'border-yel/40 bg-yel/[0.05]' : 'border-line bg-card'
        }`}
      >
        {foto === undefined ? (
          <>
            <Loader2 size={16} className="animate-spin text-dim" /> <span className="text-dim">Carregando a planilha…</span>
          </>
        ) : !supabase ? (
          <span className="text-dim">Disponível só na versão online.</span>
        ) : foto === null ? (
          <>
            <TriangleAlert size={16} className="text-yel shrink-0" />
            <span className="text-tx">Rode a migração 0027 no Supabase para ligar a conferência.</span>
          </>
        ) : nunca ? (
          <>
            <TriangleAlert size={16} className="text-yel shrink-0" />
            <span className="text-tx">A planilha ainda não mandou nada — veja abaixo como ligar (uma vez só).</span>
          </>
        ) : (
          <>
            {atrasada ? <TriangleAlert size={16} className="text-yel shrink-0" /> : <CheckCircle2 size={16} className="text-grn shrink-0" />}
            <span className="text-tx">
              Planilha recebida {haQuanto(new Date(foto.recebidoEm!).getTime(), agora)}
              <span className="text-dim">
                {' '}· {abas} {abas === 1 ? 'aba' : 'abas'} · {foto.linhas.length} pagamentos
                {atrasada && ' · o envio de hora em hora parou? Abra a planilha e use Dashboard → Enviar agora'}
              </span>
            </span>
          </>
        )}
      </div>

      {meses.length > 0 && (
        <div className="flex flex-wrap gap-1 self-start rounded-[10px] border border-line2 p-[3px]">
          {meses.map((m) => (
            <button
              key={m}
              onClick={() => setMes(m)}
              className={`px-3 py-[6px] rounded-[7px] text-[12px] font-semibold ${m === mes ? 'bg-chip text-tx' : 'text-dim hover:text-tx'}`}
            >
              {nomeMes(m)}
            </button>
          ))}
        </div>
      )}

      {conf && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:gap-3.5">
            <KpiCard
              Icon={FileSpreadsheet}
              color={COR.ouro}
              valueColor={COR.texto}
              label="Planilha"
              value={brl(conf.planilha.total)}
              sub={`${conf.planilha.qtd} pagamentos${conf.ultimaData ? ` · até ${dm(conf.ultimaData)}` : ''}`}
            />
            <KpiCard
              Icon={LayoutDashboard}
              color={COR.ouro}
              valueColor={COR.texto}
              label="Dashboard"
              value={brl(conf.dashboard.total)}
              sub={`${conf.dashboard.qtd} pedidos pagos no mês`}
            />
            <KpiCard
              Icon={bate ? CheckCircle2 : TriangleAlert}
              color={bate ? COR.verde : diferencaTotal === 0 ? COR.ambar : COR.vermelho}
              label="Diferença"
              value={bate ? 'Bate' : brl(diferencaTotal)}
              sub={bate ? 'Tudo igual à planilha' : `${diferencas.length} ${diferencas.length === 1 ? 'ponto' : 'pontos'} para conferir`}
            />
          </div>

          <Panel title="Por vendedor" hint={nomeMes(conf.mes)}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-dim2 text-[11px] text-left">
                    <th className="px-4 lg:px-5 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 font-medium text-right">Planilha</th>
                    <th className="px-3 py-2 font-medium text-right">Dashboard</th>
                    <th className="px-4 lg:px-5 py-2 font-medium text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => {
                    const p = conf.planilha.porVendedor[v] ?? { total: 0, qtd: 0 };
                    const d = conf.dashboard.porVendedor[v] ?? { total: 0, qtd: 0 };
                    const dif = Math.round((d.total - p.total) * 100) / 100;
                    return (
                      <tr key={v} className="border-t border-line/70">
                        <td className="px-4 lg:px-5 py-2.5 font-semibold text-tx">{v}</td>
                        <td className="px-3 py-2.5 text-right mono text-tx">
                          {brl(p.total)} <span className="text-dim2">· {p.qtd}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right mono text-tx">
                          {brl(d.total)} <span className="text-dim2">· {d.qtd}</span>
                        </td>
                        <td className={`px-4 lg:px-5 py-2.5 text-right mono font-bold ${dif === 0 ? 'text-grn' : 'text-red'}`}>
                          {dif === 0 ? <Check size={14} className="inline" /> : brl(dif)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="O que não bate" hint={diferencas.length ? `${diferencas.length} no mês` : undefined}>
            {erro && <div className="px-4 lg:px-5 py-2.5 border-b border-line text-[12.5px] text-red">{erro}</div>}
            {diferencas.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-grn font-semibold">Tudo bate com a planilha em {nomeMes(conf.mes)}.</div>
            ) : (
              <div>
                {diferencas.map((d) => {
                  const t = TIPO[d.tipo];
                  const chave = `${d.tipo}:${d.pedido_id}`;
                  const p = porId.get(d.pedido_id);
                  return (
                    <div key={chave} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 lg:px-5 py-3 border-t border-line/70 first:border-t-0">
                      <span
                        className={`shrink-0 px-2 py-[3px] rounded-[7px] text-[11px] font-bold border ${
                          t.cor === 'red' ? 'text-red border-red/40 bg-red/[0.08]' : 'text-yel border-yel/40 bg-yel/[0.08]'
                        }`}
                      >
                        {t.rotulo}
                      </span>
                      <div className="min-w-0 flex-1 basis-[240px]">
                        <div className="text-[13px] font-semibold text-tx truncate">
                          {p?.cliente || (d.internal_id != null ? `Pedido #${d.internal_id}` : 'Pedido')}
                          <span className="text-dim2 font-normal mono text-[11.5px]">
                            {p?.cliente && d.internal_id != null && ` · #${d.internal_id}`} · {d.pedido_id}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-dim leading-snug">
                          {d.planilha && <>Planilha: <b className="text-tx font-semibold">{d.planilha}</b></>}
                          {d.planilha && d.dashboard && ' · '}
                          {d.dashboard && <>Dashboard: <b className="text-tx font-semibold">{d.dashboard}</b></>}
                        </div>
                        <div className="text-[11px] text-dim2 leading-snug">
                          {d.outroMes ? 'Cai em outro mês: muda o fechamento dos dois meses — confira antes.' : t.explica}
                        </div>
                      </div>
                      {d.corrigirPara && (
                        <button
                          onClick={() => corrigir(d)}
                          disabled={corrigindo != null}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold text-gold2 hover:text-gold border border-gold/40 disabled:opacity-50"
                        >
                          {corrigindo === chave ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Usar o da planilha
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-4 lg:px-5 py-3 border-t border-line text-[11px] text-dim2 leading-relaxed">
              Corrigido sozinho, de hora em hora: valor e data de pagamento (dentro do mesmo mês) de pedido pago, que aparece uma vez
              só na planilha e com o mesmo vendedor. O valor corrigido não volta com a próxima atualização do BlueSales. "Pago só na
              dashboard" conta até o último dia que a planilha já tem. Cada aba vale para o mês da maioria das linhas dela.
            </div>
          </Panel>
        </>
      )}

      <Panel title="Correções feitas" hint={ajustes.length ? 'as últimas 100' : undefined}>
        {ajustes.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-dim2">Nenhuma correção ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <tbody>
                {ajustes.map((a) => (
                  <tr key={a.id} className="border-t border-line/70 first:border-t-0">
                    <td className="px-4 lg:px-5 py-2.5 text-dim2 whitespace-nowrap mono">
                      {new Date(a.aplicado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-tx font-semibold">{porId.get(a.pedido_id)?.cliente || `#${a.internal_id ?? '—'}`}</span>
                      <span className="text-dim2 mono text-[11px]"> #{a.internal_id ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-dim whitespace-nowrap">{CAMPO[a.campo] ?? a.campo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap mono">
                      <span className="text-dim2 line-through">{valorDoCampo(a.campo, a.de)}</span>{' '}
                      <span className="text-tx font-semibold">→ {valorDoCampo(a.campo, a.para)}</span>
                    </td>
                    <td className="px-4 lg:px-5 py-2.5 text-right">
                      <span className="text-[11px] font-semibold text-gold2">{a.origem === 'manual' ? 'Na tela' : 'Automático'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ComoLigar aberto={nunca || foto === null} />
    </div>
  );
}

/** Passo a passo para ligar a planilha (uma vez só) + o script. */
function ComoLigar({ aberto: abertoPadrao }: { aberto: boolean }) {
  // Aberto sozinho enquanto a planilha não mandou nada; depois, como a pessoa deixar.
  const [escolha, setAberto] = useState<boolean | null>(null);
  const aberto = escolha ?? abertoPadrao;
  const [copiado, setCopiado] = useState(false);
  const script = useMemo(() => scriptDaPlanilha(window.location.origin), []);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(script);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="bg-card border border-line rounded-card overflow-hidden">
      <button onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="w-full px-[18px] py-[15px] flex items-center justify-between text-left">
        <span className="text-[14.5px] font-bold text-tx">Como ligar a planilha</span>
        <ChevronDown size={16} className={`text-dim2 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="px-4 lg:px-5 pb-5 border-t border-line pt-4 flex flex-col gap-3 text-[13px] text-dim leading-relaxed">
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>
              Na planilha de pagamentos: <b className="text-tx">Extensões → Apps Script</b>. Apague o que estiver lá, cole o código abaixo e
              clique em salvar.
            </li>
            <li>
              Recarregue a planilha: aparece o menu <b className="text-tx">Dashboard</b>. Em <b className="text-tx">Dashboard → Configurar token</b>,
              cole o mesmo PLANILHA_TOKEN que está na Vercel.
            </li>
            <li>
              <b className="text-tx">Dashboard → Ligar envio de hora em hora</b>. Na primeira vez o Google pede permissão: é para o script ler a
              planilha e mandar para a dashboard.
            </li>
            <li>Pronto. De hora em hora, sozinho. Para mandar na hora: <b className="text-tx">Dashboard → Enviar agora</b>.</li>
          </ol>
          <p className="text-[12px] text-dim2">
            O script manda só código do pedido, valor, data, vendedor e método — o nome da cliente não sai da planilha. O token não fica
            escrito no código.
          </p>
          <div className="relative">
            <button
              onClick={copiar}
              className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-[8px] text-[11.5px] font-semibold bg-card3 border border-line2 text-tx hover:border-gold/50"
            >
              {copiado ? <Check size={13} className="text-grn" /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar código'}
            </button>
            <pre className="max-h-[320px] overflow-auto rounded-[10px] bg-bg border border-line p-3 pt-10 text-[11px] leading-[1.5] text-tx2 whitespace-pre">
              {script}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
