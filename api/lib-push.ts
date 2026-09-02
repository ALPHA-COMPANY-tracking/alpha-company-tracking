// ─────────────────────────────────────────────────────────────
// TEXTO das notificações — uma fonte só para o webhook e para o
// botão de teste, para os dois não divergirem.
//
// O ENVIO não mora aqui de propósito: cada endpoint manda inline.
// Esta hospedagem já derrubou função por causa de módulo local duas
// vezes, e o webhook (o único que delegava o envio) foi justamente o
// único que nunca entregou. Texto é barato de importar; entrega, não.
// ─────────────────────────────────────────────────────────────

export interface Aviso {
  titulo: string;
  corpo: string;
  tag?: string;
  url?: string;
}

/** Valor em reais → "R$ 735,00". */
export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Monta o aviso do evento, ou null se o evento não merece notificação.
 *
 * `cliente` vem direto do evento e é usado só para escrever a mensagem —
 * nunca é gravado no banco (ver semDadosPessoais no webhook).
 */
export function avisoDoEvento(
  evento: string,
  status: string,
  vendedor: string | null,
  valor: number,
  cliente?: string | null,
): Aviso | null {
  const nomeVendedor = (vendedor ?? '').trim() || 'Sem atendente';
  const nomeCliente = (cliente ?? '').trim();
  const st = (status ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (st === 'pagos' || st === 'pago') {
    return {
      titulo: `💰 Pagamento aprovado · ${brl(valor)}`,
      // Quem pagou é a informação útil aqui; sem o nome, cai no vendedor.
      corpo: nomeCliente || `${nomeVendedor} recebeu o pagamento.`,
      tag: 'pago',
    };
  }
  if (evento === 'ORDER_CREATE') {
    return {
      titulo: `🗓️ Novo agendamento · ${brl(valor)}`,
      corpo: `${nomeVendedor} acabou de agendar um pedido.`,
      tag: 'agendado',
    };
  }
  return null; // envio, cobrança etc. não viram notificação
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
