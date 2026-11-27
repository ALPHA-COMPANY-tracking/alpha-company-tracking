// ─────────────────────────────────────────────────────────────
// "Conferir com o export do BlueSales": o Jonas solta o export "todas as
// etapas" aqui e a dashboard acerta sozinha o que o BlueSales não avisa
// (pedido apagado, valor, etapa). Regras em src/lib/conferenciaExport.ts.
// O arquivo é lido NESTE navegador e descartado: nenhum dado de cliente
// vai para o banco.
// ─────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';
import type { Pedido } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { useData } from '@/store/DataProvider';
import {
  type Aviso,
  type Conferencia,
  type Mudanca,
  type PedidoDoExport,
  conferirComExport,
  lerExportBlueSales,
  periodoDoExport,
} from '@/lib/conferenciaExport';

const brl = (v: number) => formatBRL(reaisToCents(v));
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const numero = (p: { internal_id?: number | null; id: string }) => (p.internal_id != null ? `#${p.internal_id}` : p.id);
const etapaAqui = (s: string | null | undefined) => (s ?? '—').replace(/_/g, ' ');

type Estado =
  | { fase: 'vazio' }
  | { fase: 'lendo' }
  | { fase: 'pronto'; conf: Conferencia; arquivo: string; exportadoEm: Date }
  | { fase: 'aplicando'; conf: Conferencia; arquivo: string; exportadoEm: Date }
  | { fase: 'feito'; conf: Conferencia; arquivo: string }
  | { fase: 'erro'; texto: string };

export function ConferenciaExport() {
  const { pedidos, chegadaDosPedidos, aplicarConferencia } = useData();
  const [estado, setEstado] = useState<Estado>({ fase: 'vazio' });
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function ler(arquivo: File) {
    setEstado({ fase: 'lendo' });
    try {
      const linhas: PedidoDoExport[] = lerExportBlueSales(await arquivo.text());
      const periodo = periodoDoExport(arquivo.name, linhas);
      if (!periodo) throw new Error('O arquivo não tem nenhum pedido.');
      const exportadoEm = new Date(arquivo.lastModified || Date.now());
      // Primeiro sem as chegadas, só para saber quem iria para a lixeira.
      const previa = conferirComExport(linhas, pedidos, periodo, exportadoEm);
      const candidatos = previa.mudancas.filter((m) => m.tipo === 'lixeira').map((m) => m.pedido.id);
      const chegadas = candidatos.length ? await chegadaDosPedidos(candidatos) : {};
      const conf = conferirComExport(linhas, pedidos, periodo, exportadoEm, chegadas);
      setEstado({ fase: 'pronto', conf, arquivo: arquivo.name, exportadoEm });
    } catch (e) {
      setEstado({ fase: 'erro', texto: String((e as Error)?.message ?? e) });
    }
  }

  async function aplicar() {
    if (estado.fase !== 'pronto') return;
    setEstado({ ...estado, fase: 'aplicando' });
    try {
      await aplicarConferencia(estado.conf.mudancas);
      setEstado({ fase: 'feito', conf: estado.conf, arquivo: estado.arquivo });
    } catch (e) {
      setEstado({ fase: 'erro', texto: `Não gravou tudo (${String((e as Error)?.message ?? e)}). A tela voltou ao que está no banco — tente de novo.` });
    }
  }

  const escolher = (
    <input
      ref={input}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) ler(f);
      }}
    />
  );

  if (estado.fase === 'vazio' || estado.fase === 'lendo' || estado.fase === 'erro') {
    return (
      <div className="flex flex-col gap-2">
        {escolher}
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) ler(f);
          }}
          disabled={estado.fase === 'lendo'}
          className={`w-full rounded-[12px] border border-dashed px-4 py-4 text-left transition-colors ${
            arrastando ? 'border-gold bg-gold/10' : 'border-gold/40 bg-gold/[0.04] hover:bg-gold/[0.08]'
          }`}
        >
          <div className="flex items-center gap-3">
            {estado.fase === 'lendo' ? <Loader2 size={18} className="text-gold animate-spin shrink-0" /> : <FileUp size={18} className="text-gold shrink-0" />}
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-tx">
                {estado.fase === 'lendo' ? 'Conferindo pedido por pedido…' : 'Conferir com o export do BlueSales'}
              </div>
              <div className="text-[11.5px] text-dim mt-0.5 leading-relaxed">
                No BlueSales: <b className="text-tx2">Pedidos → exportar "todas as etapas"</b> do período. Arraste o arquivo aqui
                ou clique para escolher. A dashboard mostra o que está diferente e acerta com um clique. O arquivo é lido só
                neste navegador — nenhum dado de cliente é gravado.
              </div>
            </div>
          </div>
        </button>
        {estado.fase === 'erro' && <div className="text-[12px] text-red">{estado.texto}</div>}
      </div>
    );
  }

  const { conf } = estado;
  const n = conf.mudancas.length;
  const bate = conf.depois.qtd === conf.blueSales.qtd && reaisToCents(conf.depois.valor) === reaisToCents(conf.blueSales.valor);

  return (
    <div className="rounded-[12px] border border-line2 bg-card2 overflow-hidden">
      {escolher}
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-tx">
            Export do BlueSales · {diaMes(conf.periodo.inicio)} a {diaMes(conf.periodo.fim)}
          </div>
          <div className="text-[10.5px] text-dim2 truncate">{estado.arquivo}</div>
        </div>
        <button
          type="button"
          onClick={() => setEstado({ fase: 'vazio' })}
          className="inline-flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[11.5px] font-semibold text-dim border border-line2 hover:text-tx"
        >
          <RotateCcw size={12} /> Outro arquivo
        </button>
      </div>

      {/* Antes × depois × BlueSales */}
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <Total rotulo="Dashboard agora" t={conf.antes} />
        <Total rotulo={estado.fase === 'feito' ? 'Dashboard corrigida' : 'Depois de corrigir'} t={conf.depois} destaque />
        <Total rotulo="BlueSales (export)" t={conf.blueSales} />
      </div>

      <div className="p-4 flex flex-col gap-3">
        {estado.fase === 'feito' ? (
          <div className="flex items-start gap-2 text-[12.5px] text-grn">
            <CheckCircle2 size={16} className="shrink-0 mt-[1px]" />
            <span>
              Pronto: {n} correç{n === 1 ? 'ão gravada' : 'ões gravadas'}.{' '}
              {bate ? 'O agendado do período bate com o export.' : 'Veja os avisos abaixo: o que sobra não dá para acertar sozinho.'}
            </span>
          </div>
        ) : n === 0 ? (
          <div className="flex items-start gap-2 text-[12.5px] text-grn">
            <CheckCircle2 size={16} className="shrink-0 mt-[1px]" />
            <span>Nada para corrigir: os pedidos do período estão iguais ao export.</span>
          </div>
        ) : (
          <>
            <ListaMudancas mudancas={conf.mudancas} />
            <button
              type="button"
              onClick={aplicar}
              disabled={estado.fase === 'aplicando'}
              className="self-start inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-bold text-[#15120a] bg-gold-metal disabled:opacity-60"
            >
              {estado.fase === 'aplicando' && <Loader2 size={14} className="animate-spin" />}
              Corrigir {n} pedido{n === 1 ? '' : 's'}
            </button>
          </>
        )}

        {conf.avisos.length > 0 && <ListaAvisos avisos={conf.avisos} />}
      </div>
    </div>
  );
}

function Total({ rotulo, t, destaque }: { rotulo: string; t: { qtd: number; valor: number }; destaque?: boolean }) {
  return (
    <div className="px-3 py-2.5 min-w-0">
      <div className="text-[10px] text-dim font-medium leading-tight">{rotulo}</div>
      <div className={`mono text-[13px] lg:text-[15px] font-extrabold truncate ${destaque ? 'text-gold2' : 'text-tx'}`}>{brl(t.valor)}</div>
      <div className="text-[10px] text-dim2">
        {t.qtd} venda{t.qtd === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function Grupo({ titulo, nota, itens }: { titulo: string; nota: string; itens: { chave: string; esquerda: string; direita: string }[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <div className="text-[11.5px] font-bold text-tx">
        {titulo} <span className="text-dim2 font-normal">· {itens.length}</span>
      </div>
      <div className="text-[10.5px] text-dim2 mb-1">{nota}</div>
      <div className="flex flex-col divide-y divide-line/70 rounded-[10px] border border-line bg-card">
        {itens.map((i) => (
          <div key={i.chave} className="flex items-center justify-between gap-3 px-3 py-[7px] text-[12px]">
            <span className="mono text-tx2 min-w-0 truncate">{i.esquerda}</span>
            <span className="mono text-dim shrink-0">{i.direita}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListaMudancas({ mudancas }: { mudancas: Mudanca[] }) {
  const de = <T extends Mudanca['tipo']>(tipo: T) => mudancas.filter((m): m is Extract<Mudanca, { tipo: T }> => m.tipo === tipo);
  const linha = (p: Pedido, direita: string) => ({ chave: p.id, esquerda: `${numero(p)} · ${diaMes(p.data)}`, direita });
  return (
    <div className="flex flex-col gap-3">
      <Grupo
        titulo="Vão para a lixeira"
        nota="Não existem mais no BlueSales (apagados lá, sem aviso). Ficam na lista de excluídas e podem voltar."
        itens={de('lixeira').map((m) => linha(m.pedido, `${etapaAqui(m.pedido.status)} · ${brl(Number(m.pedido.valor_agendado ?? m.pedido.valor) || 0)}`))}
      />
      <Grupo
        titulo="Voltam da lixeira"
        nota="Estão no BlueSales, mas tinham saído daqui."
        itens={de('voltar').map((m) => linha(m.pedido, `${m.etapa} · ${brl(Number(m.pedido.valor_agendado ?? m.pedido.valor) || 0)}`))}
      />
      <Grupo
        titulo="Valor corrigido"
        nota="O valor de lá (valor − desconto) — plano trocado ou desconto dado depois."
        itens={de('valor').map((m) => linha(m.pedido, `${brl(m.de)} → ${brl(m.para)}`))}
      />
      <Grupo
        titulo="Etapa corrigida"
        nota="Recusado, aguardando pagamento e cancelado não contam como venda (como no BlueSales); o cancelado aparece no card Cancelados."
        itens={de('etapa').map((m) => linha(m.pedido, `${etapaAqui(m.de)} → ${m.etapa}`))}
      />
    </div>
  );
}

function ListaAvisos({ avisos }: { avisos: Aviso[] }) {
  const de = <T extends Aviso['tipo']>(tipo: T) => avisos.filter((a): a is Extract<Aviso, { tipo: T }> => a.tipo === tipo);
  const doExport = (l: PedidoDoExport, direita: string) => ({ chave: l.codigo, esquerda: `#${l.numero} · ${diaMes(l.data)}`, direita });
  const daqui = (p: Pedido, direita: string) => ({ chave: p.id, esquerda: `${numero(p)} · ${diaMes(p.data)}`, direita });
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-yel/25 bg-yel/[0.04] p-3">
      <div className="flex items-center gap-2 text-[12px] font-bold text-yel">
        <TriangleAlert size={14} /> Não mexi — confira se precisar
      </div>
      <Grupo
        titulo="Pagos aqui, mas fora do export"
        nota="Pago não vai para a lixeira sozinho. Se foi apagado no BlueSales, use a lixeira da lista."
        itens={de('pago_fora').map((a) => daqui(a.pedido, brl(a.pedido.valor)))}
      />
      <Grupo
        titulo="Chegaram depois do export"
        nota="Pedidos novos que o arquivo ainda não tinha — estão certos."
        itens={de('chegou_depois').map((a) => daqui(a.pedido, brl(Number(a.pedido.valor_agendado ?? a.pedido.valor) || 0)))}
      />
      <Grupo
        titulo="No BlueSales, sem aviso aqui"
        nota="O BlueSales ainda não mandou o aviso de pedido criado (ele só conta a venda depois de confirmada). Chega sozinho."
        itens={de('falta_aqui').map((a) => doExport(a.linha, `${a.linha.etapa} · ${brl(a.linha.valor)}`))}
      />
      <Grupo
        titulo="Etapa que a dashboard não conhece"
        nota="Etapa nova do BlueSales: me avise para entrar na regra."
        itens={de('etapa_desconhecida').map((a) => daqui(a.pedido, `${etapaAqui(a.pedido.status)} · lá: ${a.etapa}`))}
      />
      <Grupo
        titulo="Pago no BlueSales, não aqui"
        nota="Os pagamentos seguem a planilha: confira lá antes de lançar."
        itens={de('pago_la').map((a) => doExport(a.linha, `pago ${a.linha.pago_em ? diaMes(a.linha.pago_em) : ''} · ${brl(a.linha.valor)}`))}
      />
      <Grupo
        titulo="Pago aqui, não no BlueSales"
        nota="Se a baixa foi dada sem querer, desfaça na tela Vendas Aprovadas (lixeira do pagamento)."
        itens={de('pago_aqui').map((a) => daqui(a.pedido, `lá: ${a.linha.etapa} · ${brl(a.pedido.valor)}`))}
      />
    </div>
  );
}
