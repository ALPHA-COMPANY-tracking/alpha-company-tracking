// ─────────────────────────────────────────────────────────────
// Integração Facebook: as contas de anúncio que entram no P&L, a taxa do
// dólar, o imposto das contas em real e o gasto sincronizado — o mesmo
// que a integração do BlueSales mostra.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plug, RefreshCw, Save, Scale, TriangleAlert } from 'lucide-react';
import { formatBRL, reaisToCents } from '@/lib/money';
import { addDias, hojeIso } from '@/lib/dates';
import { haQuanto } from '@/lib/saudacao';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import {
  type ContaMeta,
  type RespostaMeta,
  listarContasMeta,
  metaDisponivel,
  salvarConfigMeta,
  sincronizarMeta,
} from '@/lib/metaAds';

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function formatData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** 5.4 → "5,40"; aceita de volta "5,4" ou "5.40". */
const numBR = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 });
const lerNum = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

function SeloMoeda({ moeda }: { moeda: string }) {
  const dolar = moeda === 'USD';
  return (
    <span
      className={`text-[10px] font-bold rounded-full border px-[8px] py-[2px] ${
        dolar ? 'text-gold2 border-gold/40 bg-gold/10' : 'text-tx2 border-line2 bg-chip'
      }`}
    >
      {moeda}
    </span>
  );
}

export function FacebookScreen() {
  const { dailies, recarregar } = useData();

  // ── Contas e configuração ──
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaMeta[]>([]);
  const [salvas, setSalvas] = useState<string[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [cotacao, setCotacao] = useState('');
  const [imposto, setImposto] = useState('');
  const [cfg, setCfg] = useState<{ cotacao: number | null; imposto: number } | null>(null);
  const [migracao, setMigracao] = useState(true);
  const [salvando, setSalvando] = useState<'contas' | 'cotacao' | 'imposto' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!metaDisponivel) return;
    listarContasMeta().then((r) => {
      setCarregando(false);
      if (!r.ok) return setErro(r.aviso);
      setContas(r.contas);
      setSalvas(r.config.contas);
      setMarcadas(new Set(r.config.contas));
      setCfg({ cotacao: r.config.cotacao_usd, imposto: r.config.imposto_brl_pct });
      setCotacao(r.config.cotacao_usd != null ? numBR(r.config.cotacao_usd) : '');
      setImposto(numBR(r.config.imposto_brl_pct, 1));
      setMigracao(r.migracao);
    });
  }, []);

  const selecaoMudou = marcadas.size !== salvas.length || salvas.some((id) => !marcadas.has(id));

  async function salvar(qual: 'contas' | 'cotacao' | 'imposto') {
    setAviso(null);
    const patch =
      qual === 'contas'
        ? { contas: [...marcadas] }
        : qual === 'cotacao'
          ? { cotacao_usd: lerNum(cotacao) }
          : { imposto_brl_pct: lerNum(imposto) };
    setSalvando(qual);
    const r = await salvarConfigMeta(patch);
    setSalvando(null);
    if (!r.ok) return setAviso(r.aviso);
    setSalvas(r.config.contas);
    setCfg({ cotacao: r.config.cotacao_usd, imposto: r.config.imposto_brl_pct });
    setAviso(
      qual === 'contas'
        ? 'Seleção salva. Toque em Sincronizar agora para refazer o gasto com as contas novas.'
        : 'Salvo. Vale a partir da próxima sincronização.',
    );
  }

  // ── Sincronização ──
  const [ocupado, setOcupado] = useState<'sincronizar' | 'comparar' | null>(null);
  const [resposta, setResposta] = useState<RespostaMeta | null>(null);
  const ultimaSync = useMemo(() => {
    const vezes = dailies.map((d) => d.ads_sincronizado_em).filter((v): v is string => !!v);
    return vezes.length ? Math.max(...vezes.map((v) => Date.parse(v))) : null;
  }, [dailies]);

  async function sincronizar() {
    setOcupado('sincronizar');
    // Refaz tudo o que vem do Meta (o servidor começa em 16/09, quando a
    // integração começou): pega os ajustes que o Meta faz nos dias seguintes.
    const r = await sincronizarMeta({ desde: addDias(hojeIso(), -29) });
    setResposta(r);
    if (r.ok) await recarregar();
    setOcupado(null);
  }

  async function comparar() {
    // Os 7 dias antes de ontem: já fechados, com o valor do BlueSales na
    // dashboard. Não grava nada — só mostra lado a lado.
    setOcupado('comparar');
    const hoje = hojeIso();
    setResposta(await sincronizarMeta({ desde: addDias(hoje, -8), ate: addDias(hoje, -2), simular: true }));
    setOcupado(null);
  }

  // ── Gasto sincronizado: últimos 30 dias, por conta ──
  const porConta = useMemo(() => {
    const desde = addDias(hojeIso(), -29);
    const soma = new Map<string, { moeda: string; valor: number; reais: number }>();
    for (const d of dailies) {
      if (d.data < desde) continue;
      for (const p of d.ads_detalhe ?? []) {
        const s = soma.get(p.conta) ?? { moeda: p.moeda, valor: 0, reais: 0 };
        s.valor += p.valor;
        s.reais += p.reais;
        soma.set(p.conta, s);
      }
    }
    return [...soma.entries()].map(([conta, s]) => ({ conta, ...s })).sort((a, b) => b.reais - a.reais);
  }, [dailies]);
  const nomeDa = (id: string) => contas.find((c) => c.id === id)?.nome ?? `act_${id}`;

  if (!metaDisponivel) {
    return (
      <div className="text-[13px] text-dim">A Integração Facebook funciona só na versão online da dashboard.</div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Integração Facebook</h1>
        <p className="text-[13px] text-dim mt-0.5">
          As contas de anúncio que entram no P&amp;L, a taxa do dólar e o imposto — o gasto entra sozinho
        </p>
      </div>

      {!migracao && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-yel/40 bg-yel/[0.07] px-4 py-3 text-[12.5px] text-dim">
          <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
          Falta rodar a migração 0019 no Supabase para salvar as escolhas desta tela.
        </div>
      )}

      {/* Sincronização */}
      <Panel
        title="Sincronização"
        hint={ultimaSync ? `última sincronização ${haQuanto(ultimaSync)}` : 'ainda não sincronizou'}
      >
        <div className="p-3.5 lg:p-5 flex flex-col gap-4">
          <p className="m-0 text-[12.5px] text-dim leading-relaxed">
            O gasto dos <b className="text-tx">últimos 3 dias</b> das contas marcadas é buscado no Meta a cada 30 minutos,
            antes do fechamento das 23h e quando alguém toca em <b className="text-tx">Atualizar</b> — o Meta ainda ajusta um dia
            depois que ele acaba. <b className="text-tx">Sincronizar agora</b> refaz todos os dias desde 16/09, quando a
            integração começou; os dias antes disso, lançados à mão, não mudam.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={sincronizar}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-60"
            >
              <RefreshCw size={15} className={ocupado === 'sincronizar' ? 'animate-spin' : ''} />
              Sincronizar agora
            </button>
            <button
              onClick={comparar}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-tx border border-line2 hover:bg-white/[0.04] disabled:opacity-60"
            >
              <Scale size={15} className={ocupado === 'comparar' ? 'animate-pulse' : ''} />
              Comparar com a dashboard (7 dias)
            </button>
          </div>
          {resposta && <ResultadoMeta r={resposta} />}
        </div>
      </Panel>

      {/* Contas de anúncio */}
      <Panel
        title="Contas de anúncio"
        right={
          <button
            onClick={() => salvar('contas')}
            disabled={!selecaoMudou || salvando !== null || !migracao}
            className={`inline-flex items-center gap-2 px-3.5 py-[7px] rounded-[10px] text-[12.5px] font-semibold transition-colors ${
              selecaoMudou ? 'bg-white text-bg' : 'bg-chip text-dim2'
            } disabled:cursor-default`}
          >
            {salvando === 'contas' ? <Loader2 size={14} className="animate-spin" /> : selecaoMudou ? <Save size={14} /> : <Check size={14} />}
            {selecaoMudou ? 'Salvar seleção' : 'Seleção salva'}
          </button>
        }
      >
        <div className="px-3.5 lg:px-5 pt-3 text-[12px] text-dim2">Marque as contas cujo gasto deve entrar no P&amp;L.</div>
        {carregando ? (
          <div className="p-8 flex items-center justify-center gap-2 text-[13px] text-dim2">
            <Loader2 size={15} className="animate-spin" /> Buscando as contas no Meta…
          </div>
        ) : erro ? (
          <div className="m-3.5 lg:m-5 flex items-start gap-2.5 rounded-[10px] border border-yel/40 bg-yel/[0.07] px-3.5 py-3 text-[12.5px] text-dim">
            <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
            {erro}
          </div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
                  <th className="w-10" />
                  <th className="text-left font-semibold px-3 py-2.5">Conta</th>
                  <th className="text-left font-semibold px-3 py-2.5">Moeda</th>
                  <th className="hidden sm:table-cell text-left font-semibold px-3 py-2.5">Status</th>
                  <th className="hidden md:table-cell text-right font-semibold px-3 lg:px-5 py-2.5">Última sync</th>
                </tr>
              </thead>
              <tbody>
                {contas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-dim2">
                      Nenhuma conta liberada para o token.
                    </td>
                  </tr>
                ) : (
                  contas.map((c) => {
                    const marcada = marcadas.has(c.id);
                    const sincronizada = salvas.includes(c.id) && ultimaSync;
                    return (
                      <tr
                        key={c.id}
                        onClick={() =>
                          setMarcadas((atual) => {
                            const nova = new Set(atual);
                            if (nova.has(c.id)) nova.delete(c.id);
                            else nova.add(c.id);
                            return nova;
                          })
                        }
                        className={`border-t border-line/70 cursor-pointer hover:bg-white/[0.02] ${marcada ? 'bg-gold/[0.03]' : ''}`}
                      >
                        <td className="pl-3.5 lg:pl-5 py-3">
                          <span
                            className={`grid place-items-center w-[18px] h-[18px] rounded-full border ${
                              marcada ? 'bg-gold border-gold text-[#15120a]' : 'border-line2'
                            }`}
                          >
                            {marcada && <Check size={12} strokeWidth={3} />}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-tx">{c.nome}</div>
                          <div className="text-[10.5px] mono text-dim2 break-all">
                            act_{c.id}
                            {c.business && ` · ${c.business}`}
                          </div>
                          <div className={`sm:hidden text-[11px] mt-0.5 ${c.ativa ? 'text-tx2' : 'text-dim2'}`}>{c.status}</div>
                        </td>
                        <td className="px-3 py-3">
                          <SeloMoeda moeda={c.moeda} />
                        </td>
                        <td className={`hidden sm:table-cell px-3 py-3 ${c.ativa ? 'text-tx2' : 'text-dim2'}`}>{c.status}</td>
                        <td className="hidden md:table-cell px-3 lg:px-5 py-3 text-right mono text-[12px] text-dim">
                          {sincronizada
                            ? new Date(ultimaSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3.5 lg:px-5 py-3 border-t border-line text-[11.5px] text-dim2 leading-relaxed">
          Aparecem as contas liberadas para o usuário do sistema do token. Para uma conta nova aparecer aqui:
          Configurações do negócio → Usuários do sistema → <b className="text-dim">Atribuir ativos</b> → marque a conta
          com &quot;Ver desempenho&quot;.
        </div>
      </Panel>

      {/* Conversão e imposto */}
      <Panel title="Conversão de moeda e imposto">
        <div className="p-3.5 lg:p-5 grid gap-4 lg:grid-cols-2">
          <CampoNumero
            rotulo="Taxa USD → BRL"
            ajuda="Contas em dólar: gasto × esta taxa. O BlueSales usa R$ 5,40."
            valor={cotacao}
            onChange={setCotacao}
            salvo={cfg?.cotacao != null && lerNum(cotacao) === cfg.cotacao}
            carregando={salvando === 'cotacao'}
            desabilitado={!migracao || !(lerNum(cotacao) > 0)}
            onSalvar={() => salvar('cotacao')}
            botao="Salvar taxa"
          />
          <CampoNumero
            rotulo="Imposto do Meta nas contas em real (%)"
            ajuda="Contas em BRL: gasto + este imposto. Contas em dólar não pagam."
            valor={imposto}
            onChange={setImposto}
            salvo={cfg != null && lerNum(imposto) === cfg.imposto}
            carregando={salvando === 'imposto'}
            desabilitado={!migracao || !(lerNum(imposto) >= 0)}
            onSalvar={() => salvar('imposto')}
            botao="Salvar imposto"
          />
        </div>
        <div className="px-3.5 lg:px-5 pb-4 text-[11.5px] text-dim2 leading-relaxed">
          A taxa e o imposto valem a partir da próxima sincronização: a automática refaz os últimos 3 dias, e o botão
          Sincronizar agora refaz desde 16/09.
        </div>
        {aviso && (
          <div className="mx-3.5 lg:mx-5 mb-4 rounded-[10px] border border-line2 bg-card2 px-3.5 py-2.5 text-[12px] text-dim">
            {aviso}
          </div>
        )}
      </Panel>

      {/* Gasto sincronizado */}
      <Panel title="Gasto sincronizado" hint="últimos 30 dias, por conta">
        {porConta.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-dim2">Nenhum gasto sincronizado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-3.5 lg:px-5 py-2.5">Conta</th>
                  <th className="text-right font-semibold px-3 py-2.5">Original</th>
                  <th className="text-right font-semibold px-3.5 lg:px-5 py-2.5">Em reais</th>
                </tr>
              </thead>
              <tbody>
                {porConta.map((p) => (
                  <tr key={p.conta} className="border-t border-line/70">
                    <td className="px-3.5 lg:px-5 py-3 font-semibold text-tx">
                      <span className="inline-flex items-center gap-2">
                        <Plug size={13} className="text-gold" />
                        {nomeDa(p.conta)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right mono text-dim">
                      {p.moeda} {numBR(p.valor)}
                    </td>
                    <td className="px-3.5 lg:px-5 py-3 text-right mono font-bold text-tx">{formatBRL(reaisToCents(p.reais))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CampoNumero(p: {
  rotulo: string;
  ajuda: string;
  valor: string;
  onChange: (v: string) => void;
  salvo: boolean;
  carregando: boolean;
  desabilitado: boolean;
  onSalvar: () => void;
  botao: string;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-card2 px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-[0.1em] font-bold text-dim2">{p.rotulo}</div>
      <div className="flex items-center gap-2 mt-2">
        <input
          value={p.valor}
          onChange={(e) => p.onChange(e.target.value)}
          inputMode="decimal"
          className="w-[130px] bg-card border border-line2 rounded-[10px] px-3 py-[9px] text-[14px] text-tx mono outline-none focus:border-gold/50"
        />
        <button
          onClick={p.onSalvar}
          disabled={p.salvo || p.desabilitado || p.carregando}
          className={`inline-flex items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] text-[12.5px] font-semibold ${
            p.salvo ? 'bg-chip text-dim2' : 'bg-white text-bg'
          } disabled:cursor-default`}
        >
          {p.carregando ? <Loader2 size={14} className="animate-spin" /> : p.salvo ? <Check size={14} /> : null}
          {p.salvo ? 'Salvo' : p.botao}
        </button>
      </div>
      <div className="text-[11px] text-dim2 mt-2 leading-snug">{p.ajuda}</div>
    </div>
  );
}

/** Resultado de uma sincronização ou comparação com o Meta. */
function ResultadoMeta({ r }: { r: RespostaMeta }) {
  if (!r.ok) {
    return (
      <div className="flex items-start gap-2.5 rounded-[10px] border border-yel/40 bg-yel/[0.07] px-3.5 py-3 text-[12.5px] text-dim leading-relaxed">
        <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
        <span>
          {r.configurado === false ? (
            <>
              <b className="text-yel">Falta ligar a dashboard ao Meta.</b> {r.aviso}. Depois de corrigir na Vercel, faça
              o Redeploy e espere ficar Ready.
            </>
          ) : (
            r.aviso
          )}
        </span>
      </div>
    );
  }
  const brl = (v: number) => formatBRL(reaisToCents(v));
  return (
    <div className="rounded-[12px] border border-line overflow-hidden">
      <div className="px-3.5 py-2.5 text-[11.5px] text-dim bg-card2 border-b border-line">
        {r.simulado
          ? 'Comparação — nada foi gravado. "Na dashboard" é o valor lançado hoje em cada dia.'
          : 'Sincronizado: estes valores já estão na dashboard.'}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[520px]">
          <thead>
            <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
              <th className="text-left font-semibold px-3.5 py-2">Data</th>
              <th className="text-right font-semibold px-3.5 py-2">No Meta</th>
              <th className="text-right font-semibold px-3.5 py-2">Em R$</th>
              <th className="text-right font-semibold px-3.5 py-2">{r.simulado ? 'Na dashboard' : 'Antes'}</th>
              <th className="text-right font-semibold px-3.5 py-2">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {r.dias.map((d) => {
              const dif = Math.round((d.reais - d.na_dashboard) * 100) / 100;
              return (
                <tr key={d.data} className="border-t border-line/70">
                  <td className="px-3.5 py-2 text-tx">{formatData(d.data)}</td>
                  <td className="px-3.5 py-2 text-right mono text-dim">
                    {d.partes.length === 0
                      ? '—'
                      : d.partes
                          .map((p) =>
                            p.moeda === 'BRL'
                              ? `${brl(p.valor)}${p.imposto ? ` + ${numBR(p.imposto, 1)}% imposto` : ''}`
                              : `${p.moeda} ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × ${numBR(p.cotacao)}`,
                          )
                          .join(' + ')}
                  </td>
                  <td className="px-3.5 py-2 text-right mono text-tx font-semibold">{brl(d.reais)}</td>
                  <td className="px-3.5 py-2 text-right mono text-dim">{brl(d.na_dashboard)}</td>
                  <td className={`px-3.5 py-2 text-right mono ${dif === 0 ? 'text-grn' : 'text-yel'}`}>
                    {dif === 0 ? 'igual' : `${dif > 0 ? '+' : ''}${brl(dif)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
