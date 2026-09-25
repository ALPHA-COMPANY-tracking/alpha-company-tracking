// ─────────────────────────────────────────────────────────────
// Integração Facebook: as contas de anúncio que entram no P&L, o cadastro
// delas (Importar BM / Manual), a taxa do dólar, o imposto das contas em
// real e o gasto sincronizado — o mesmo que o BlueSales mostra.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plug, RefreshCw, Save, Scale, Search, Trash2, TriangleAlert } from 'lucide-react';
import { formatBRL, reaisToCents } from '@/lib/money';
import { addDias, hojeIso } from '@/lib/dates';
import { haQuanto } from '@/lib/saudacao';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import {
  type ContaCadastro,
  type ContaMeta,
  type ResultadoBusca,
  type RespostaMeta,
  buscarNomesMeta,
  cadastrarContasMeta,
  cadastrarManualMeta,
  listarContasMeta,
  metaDisponivel,
  redetectarContasMeta,
  removerContaMeta,
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
  const [cadastro, setCadastro] = useState<ContaCadastro[] | null>(null);
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
      setCadastro(r.cadastro);
      setSalvas(r.config.contas);
      setMarcadas(new Set(r.config.contas));
      setCfg({ cotacao: r.config.cotacao_usd, imposto: r.config.imposto_brl_pct });
      setCotacao(r.config.cotacao_usd != null ? numBR(r.config.cotacao_usd) : '');
      setImposto(numBR(r.config.imposto_brl_pct, 1));
      setMigracao(r.migracao);
    });
  }, []);

  const selecaoMudou = marcadas.size !== salvas.length || salvas.some((id) => !marcadas.has(id));

  // Contas para marcar: as do cadastro (antes da migração 0020, as que o
  // token da Vercel enxerga). Uma marcada que saiu do cadastro continua
  // aparecendo, para dar para desmarcar.
  const lista = useMemo((): (ContaMeta & { token?: ContaCadastro['token'] })[] => {
    if (!cadastro) return contas;
    const fora = salvas
      .filter((id) => !cadastro.some((c) => c.id === id))
      .map((id) => ({ id, nome: `Conta ${id}`, moeda: '—', ativa: false, status: 'Fora do cadastro', business: null }));
    return [...cadastro, ...fora];
  }, [cadastro, contas, salvas]);

  /** O cadastro mudou (importou, removeu, re-detectou). */
  function cadastroMudou(novo: ContaCadastro[], contasSalvas: string[], removida?: string) {
    setCadastro(novo);
    setSalvas(contasSalvas);
    if (removida) {
      setMarcadas((atual) => {
        const nova = new Set(atual);
        nova.delete(removida);
        return nova;
      });
    }
  }

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
  const nomeDa = (id: string) => lista.find((c) => c.id === id)?.nome ?? `act_${id}`;

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

      {(!migracao || (!carregando && !erro && cadastro === null)) && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-yel/40 bg-yel/[0.07] px-4 py-3 text-[12.5px] text-dim">
          <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
          {!migracao
            ? 'Falta rodar as migrações 0019 e 0020 no Supabase para salvar as escolhas desta tela.'
            : 'Falta rodar a migração 0020 no Supabase para o Cadastro de contas (Importar BM).'}
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
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-dim2">
                      {cadastro ? 'Nenhuma conta cadastrada — importe uma BM em Cadastro de contas, abaixo.' : 'Nenhuma conta liberada para o token.'}
                    </td>
                  </tr>
                ) : (
                  lista.map((c) => {
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
                            {c.token === 'falta' && <span className="text-yel"> · sem token</span>}
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
          {cadastro ? (
            <>
              Aparecem as contas do <b className="text-dim">Cadastro de contas</b>, abaixo. Para uma conta nova: Importar BM
              com o BM ID, o Access Token e o Account ID.
            </>
          ) : (
            <>
              Aparecem as contas liberadas para o usuário do sistema do token. Para uma conta nova aparecer aqui:
              Configurações do negócio → Usuários do sistema → <b className="text-dim">Atribuir ativos</b> → marque a conta
              com &quot;Ver desempenho&quot;.
            </>
          )}
        </div>
      </Panel>

      {/* Cadastro de contas: Importar BM / Manual */}
      {cadastro && <CadastroContas cadastro={cadastro} imposto={cfg?.imposto ?? 12.5} onMudou={cadastroMudou} />}

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

const rotuloCampo = 'block text-[10.5px] uppercase tracking-[0.1em] font-bold text-dim2 mb-[6px]';
const campo =
  'w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-[13px] text-tx outline-none focus:border-gold/50 placeholder:text-dim2/70';

const rotuloToken = (t: ContaCadastro['token']) => (t === 'bm' ? 'token salvo' : t === 'vercel' ? 'token da Vercel' : 'sem token');

function SeloStatus({ c }: { c: ContaCadastro }) {
  const manual = c.status === 'Manual';
  const ativa = c.ativa && !manual;
  return (
    <span
      title={c.status}
      className={`text-[10px] font-bold tracking-[0.06em] rounded-[6px] border px-[8px] py-[3px] ${
        ativa ? 'text-grn border-grn/40 bg-grn/10' : 'text-dim2 border-line2 bg-chip'
      }`}
    >
      {manual ? 'MANUAL' : ativa ? 'ATIVO' : 'INATIVO'}
    </span>
  );
}

/**
 * Cadastro de contas, como no BlueSales: Importar BM (BM ID + Access Token
 * + Account IDs → o Meta devolve nome e moeda → você confirma) ou Manual.
 * O token vai para o servidor e não volta mais para a tela.
 */
function CadastroContas({
  cadastro,
  imposto,
  onMudou,
}: {
  cadastro: ContaCadastro[];
  imposto: number;
  onMudou: (cadastro: ContaCadastro[], contasSalvas: string[], removida?: string) => void;
}) {
  const [aba, setAba] = useState<'bm' | 'manual'>('bm');
  const [ocupado, setOcupado] = useState<'buscar' | 'cadastrar' | 'manual' | 'redetectar' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Importar BM
  const [bmId, setBmId] = useState('');
  const [token, setToken] = useState('');
  const [ids, setIds] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const bmLimpo = bmId.replace(/\D/g, '');
  const bmTemToken = cadastro.some((c) => c.bm_id === bmLimpo && c.token === 'bm');

  // Manual
  const [mNome, setMNome] = useState('');
  const [mBm, setMBm] = useState('');
  const [mId, setMId] = useState('');
  const [mMoeda, setMMoeda] = useState<'BRL' | 'USD'>('USD');

  // Remover: pede confirmação na própria linha.
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const nomeDe = (id: string) => cadastro.find((c) => c.id === id)?.nome ?? `act_${id}`;

  async function buscarNomes() {
    setMsg(null);
    setResultados(null);
    setOcupado('buscar');
    const r = await buscarNomesMeta({ bm_id: bmId, token, ids });
    setOcupado(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.aviso });
    setResultados(r.resultados);
    // IDs colados: já vêm marcadas. Lista inteira do token: você escolhe.
    setEscolhidas(new Set(ids.trim() ? r.resultados.filter((x) => x.ok).map((x) => x.id) : []));
  }

  async function cadastrar() {
    setMsg(null);
    setOcupado('cadastrar');
    const r = await cadastrarContasMeta({ bm_id: bmId, token, ids: [...escolhidas] });
    setOcupado(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.aviso });
    onMudou(r.cadastro, r.config.contas);
    setResultados(null);
    setEscolhidas(new Set());
    setBmId('');
    setToken('');
    setIds('');
    const n = r.cadastradas ?? 0;
    const falhas = r.erros?.length ? ` ${r.erros.length} não ${r.erros.length === 1 ? 'entrou' : 'entraram'}: ${r.erros[0].erro}.` : '';
    setMsg({
      ok: true,
      texto: `${n} ${n === 1 ? 'conta cadastrada' : 'contas cadastradas'}.${falhas} Marque em Contas de anúncio, acima, as que entram no P&L.`,
    });
  }

  async function salvarManual() {
    setMsg(null);
    setOcupado('manual');
    const r = await cadastrarManualMeta({ id: mId, nome: mNome, moeda: mMoeda, bm_id: mBm });
    setOcupado(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.aviso });
    onMudou(r.cadastro, r.config.contas);
    setMNome('');
    setMBm('');
    setMId('');
    setMsg({ ok: true, texto: 'Conta cadastrada. Marque em Contas de anúncio, acima, se ela entra no P&L.' });
  }

  async function redetectar() {
    setMsg(null);
    setOcupado('redetectar');
    const r = await redetectarContasMeta();
    setOcupado(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.aviso });
    onMudou(r.cadastro, r.config.contas);
    const erros = r.erros ?? [];
    setMsg(
      erros.length
        ? { ok: false, texto: `Atualizadas, menos ${erros.map((e) => `${nomeDe(e.id)} (${e.erro})`).join('; ')}.` }
        : { ok: true, texto: 'Nome, moeda e status atualizados do Meta.' },
    );
  }

  async function remover(id: string) {
    setMsg(null);
    setConfirmar(null);
    setRemovendo(id);
    const r = await removerContaMeta(id);
    setRemovendo(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.aviso });
    onMudou(r.cadastro, r.config.contas, id);
  }

  const alternar = (id: string) =>
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  const abaBtn = (qual: 'bm' | 'manual', texto: string) => (
    <button
      onClick={() => {
        setAba(qual);
        setMsg(null);
      }}
      className={`px-3.5 py-[7px] rounded-[8px] text-[12.5px] font-semibold border transition-colors ${
        aba === qual ? 'bg-chip text-tx border-line2' : 'text-dim border-transparent hover:text-tx'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <Panel title="Cadastro de contas" hint="contas de anúncio por BM">
      <div className="px-3.5 lg:px-5 pt-3.5 flex gap-1.5">
        {abaBtn('bm', 'Importar BM')}
        {abaBtn('manual', 'Manual')}
      </div>

      {aba === 'bm' ? (
        <div className="p-3.5 lg:p-5 flex flex-col gap-3.5">
          <p className="m-0 text-[12.5px] text-dim leading-relaxed">
            Cole o <b className="text-tx">BM ID</b>, o <b className="text-tx">Access Token</b> e a lista de{' '}
            <b className="text-tx">Account IDs</b>. A dashboard busca no Meta o nome e a moeda de cada conta e você confirma
            quais cadastrar.
          </p>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="block">
              <span className={rotuloCampo}>BM ID</span>
              <input
                value={bmId}
                onChange={(e) => setBmId(e.target.value)}
                inputMode="numeric"
                placeholder="128917744882478"
                className={`${campo} mono`}
              />
            </label>
            <label className="block">
              <span className={rotuloCampo}>Access Token</span>
              {/* Mascarado: um print da tela não mostra o token. */}
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={bmTemToken ? 'token desta BM já salvo — cole só para trocar' : 'EAA…'}
                className={`${campo} mono`}
                data-1p-ignore
                data-lpignore="true"
              />
            </label>
          </div>
          <label className="block">
            <span className={rotuloCampo}>Account IDs</span>
            <textarea
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="1234567890123456, 9876543210987654, …"
              className={`${campo} mono resize-y`}
            />
            <span className="block text-[11px] text-dim2 mt-1.5 leading-snug">
              Sem o prefixo act_. Separe por vírgula, quebra de linha ou espaço. Em branco, lista todas as contas que o token
              enxerga para você escolher.
            </span>
          </label>
          <div>
            <button
              onClick={buscarNomes}
              disabled={ocupado !== null || !bmLimpo}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-50"
            >
              {ocupado === 'buscar' ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              Buscar nomes
            </button>
          </div>
          <p className="m-0 text-[11px] text-dim2 leading-snug">
            O token fica guardado só no servidor, junto da BM: depois de salvo ninguém consegue vê-lo, nem pela dashboard.
            Em branco, vale o token já salvo desta BM (ou o da Vercel).
          </p>

          {resultados && (
            <div className="rounded-[12px] border border-line overflow-hidden">
              <div className="px-3.5 py-2.5 bg-card2 border-b border-line flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-dim">
                  {resultados.length === 0 ? 'O token não enxerga nenhuma conta.' : 'Marque as contas a cadastrar.'}
                </span>
                {resultados.some((x) => x.ok) && (
                  <button
                    onClick={() =>
                      setEscolhidas(
                        escolhidas.size === resultados.filter((x) => x.ok).length
                          ? new Set()
                          : new Set(resultados.filter((x) => x.ok).map((x) => x.id)),
                      )
                    }
                    className="text-[11.5px] font-semibold text-gold2 hover:text-gold"
                  >
                    {escolhidas.size === resultados.filter((x) => x.ok).length ? 'Desmarcar todas' : 'Marcar todas'}
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {resultados.map((x) =>
                  x.ok ? (
                    <button
                      key={x.id}
                      onClick={() => alternar(x.id)}
                      className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 border-t border-line/70 first:border-t-0 hover:bg-white/[0.02] ${
                        escolhidas.has(x.id) ? 'bg-gold/[0.03]' : ''
                      }`}
                    >
                      <span
                        className={`grid place-items-center shrink-0 w-[18px] h-[18px] rounded-full border ${
                          escolhidas.has(x.id) ? 'bg-gold border-gold text-[#15120a]' : 'border-line2'
                        }`}
                      >
                        {escolhidas.has(x.id) && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-tx text-[13px] truncate">{x.nome}</span>
                        <span className="block text-[10.5px] mono text-dim2 break-all">
                          act_{x.id}
                          {x.business && ` · ${x.business}`}
                          {x.cadastrada && <span className="text-gold2"> · já cadastrada</span>}
                        </span>
                      </span>
                      <SeloMoeda moeda={x.moeda} />
                      <span className={`hidden sm:inline w-[92px] text-[12px] ${x.ativa ? 'text-tx2' : 'text-dim2'}`}>{x.status}</span>
                    </button>
                  ) : (
                    <div key={x.id} className="flex items-start gap-3 px-3.5 py-2.5 border-t border-line/70 first:border-t-0">
                      <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
                      <span className="min-w-0 text-[12px]">
                        <span className="mono text-tx">act_{x.id}</span>
                        <span className="text-dim"> — {x.erro}</span>
                      </span>
                    </div>
                  ),
                )}
              </div>
              {resultados.some((x) => x.ok) && (
                <div className="px-3.5 py-3 border-t border-line flex flex-wrap items-center gap-2">
                  <button
                    onClick={cadastrar}
                    disabled={ocupado !== null || escolhidas.size === 0}
                    className="inline-flex items-center gap-2 px-4 py-[8px] rounded-[10px] text-[12.5px] font-semibold bg-white text-bg disabled:opacity-50"
                  >
                    {ocupado === 'cadastrar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {escolhidas.size === 0
                      ? 'Cadastrar'
                      : `Cadastrar ${escolhidas.size} ${escolhidas.size === 1 ? 'conta' : 'contas'}`}
                  </button>
                  <button
                    onClick={() => setResultados(null)}
                    className="px-3.5 py-[8px] rounded-[10px] text-[12.5px] font-semibold text-dim hover:text-tx"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3.5 lg:p-5 flex flex-col gap-3.5">
          <p className="m-0 text-[12.5px] text-dim leading-relaxed">
            Cadastra a conta sem consultar o Meta. O gasto é buscado com o token da BM informada (ou o da Vercel) — use{' '}
            <b className="text-tx">Re-detectar moedas</b> depois para conferir.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className={rotuloCampo}>Nome</span>
              <input value={mNome} onChange={(e) => setMNome(e.target.value)} placeholder="CA 11" className={campo} />
            </label>
            <label className="block">
              <span className={rotuloCampo}>BM ID (opcional)</span>
              <input value={mBm} onChange={(e) => setMBm(e.target.value)} inputMode="numeric" className={`${campo} mono`} />
            </label>
            <label className="block">
              <span className={rotuloCampo}>Account ID</span>
              <input value={mId} onChange={(e) => setMId(e.target.value)} inputMode="numeric" className={`${campo} mono`} />
            </label>
            <div>
              <span className={rotuloCampo}>Moeda</span>
              <div className="flex gap-1.5">
                {(['USD', 'BRL'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMMoeda(m)}
                    className={`px-3.5 py-[9px] rounded-[10px] text-[12.5px] font-bold border ${
                      mMoeda === m ? 'border-gold/50 text-gold2 bg-gold/10' : 'border-line2 text-dim bg-card2'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <button
              onClick={salvarManual}
              disabled={ocupado !== null || !mId.replace(/\D/g, '')}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-50"
            >
              {ocupado === 'manual' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Cadastrar conta
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`mx-3.5 lg:mx-5 mb-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[12px] leading-relaxed ${
            msg.ok ? 'border-grn/35 bg-grn/[0.06] text-dim' : 'border-yel/40 bg-yel/[0.07] text-dim'
          }`}
        >
          {msg.ok ? (
            <Check size={14} className="text-grn shrink-0 mt-[2px]" />
          ) : (
            <TriangleAlert size={14} className="text-yel shrink-0 mt-[2px]" />
          )}
          {msg.texto}
        </div>
      )}

      {/* Contas cadastradas */}
      <div className="border-t border-line px-3.5 lg:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-dim2 leading-snug max-w-[640px]">
          Moeda detectada automaticamente do Meta. Contas em USD têm o gasto convertido para BRL pela taxa abaixo e não
          somam o imposto de {numBR(imposto, 1)}%.
        </span>
        <button
          onClick={redetectar}
          disabled={ocupado !== null || cadastro.length === 0}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-tx hover:text-gold2 disabled:opacity-50"
        >
          <RefreshCw size={13} className={ocupado === 'redetectar' ? 'animate-spin' : ''} />
          Re-detectar moedas
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-dim2 text-[10.5px] uppercase tracking-wide bg-card2/60">
              <th className="text-left font-semibold px-3.5 lg:px-5 py-2.5">Nome</th>
              <th className="hidden md:table-cell text-left font-semibold px-3 py-2.5">BM ID</th>
              <th className="hidden md:table-cell text-left font-semibold px-3 py-2.5">Account ID</th>
              <th className="text-left font-semibold px-2 md:px-3 py-2.5">Moeda</th>
              <th className="text-left font-semibold px-2 md:px-3 py-2.5">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cadastro.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-dim2">
                  Nenhuma conta cadastrada ainda.
                </td>
              </tr>
            ) : (
              cadastro.map((c) => (
                <tr key={c.id} className="border-t border-line/70">
                  <td className="px-3.5 lg:px-5 py-3">
                    <div className="font-semibold text-tx">{c.nome}</div>
                    {c.business && <div className="text-[10.5px] text-dim2">{c.business}</div>}
                    {/* No celular, BM e Account ID vêm aqui embaixo do nome. */}
                    <div className="md:hidden text-[10.5px] mono text-dim2 leading-snug">
                      <div>act_{c.id}</div>
                      <div>
                        {c.bm_id ? `BM ${c.bm_id}` : 'sem BM'} ·{' '}
                        <span className={c.token === 'falta' ? 'text-yel' : ''}>{rotuloToken(c.token)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-3">
                    <div className="mono text-[12px] text-tx2">{c.bm_id ?? '—'}</div>
                    <div className={`text-[10.5px] ${c.token === 'falta' ? 'text-yel' : 'text-dim2'}`}>{rotuloToken(c.token)}</div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 mono text-[12px] text-tx2">{c.id}</td>
                  <td className="px-2 md:px-3 py-3">
                    <SeloMoeda moeda={c.moeda} />
                  </td>
                  <td className="px-2 md:px-3 py-3">
                    <SeloStatus c={c} />
                  </td>
                  <td className="pl-1 pr-3 md:px-3.5 lg:px-5 py-3 text-right whitespace-nowrap">
                    {removendo === c.id ? (
                      <Loader2 size={15} className="inline animate-spin text-dim2" />
                    ) : confirmar === c.id ? (
                      <span className="inline-flex items-center gap-2 text-[12px]">
                        <button onClick={() => remover(c.id)} className="font-semibold text-red hover:underline">
                          Remover
                        </button>
                        <button onClick={() => setConfirmar(null)} className="text-dim hover:text-tx">
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmar(c.id)}
                        title="Remover do cadastro"
                        className="inline-grid place-items-center w-8 h-8 rounded-lg text-dim hover:text-red hover:bg-red/10 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
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
