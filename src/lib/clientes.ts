// ─────────────────────────────────────────────────────────────
// Alerta de Clientes: a cliente deste pedido já passou por aqui?
//
//   roubo       → outro pedido dela foi roubado — não enviar sem confirmar
//   frustracao  → outro pedido dela frustrou (devolveu, cancelou, voltou…)
//   duplicado   → ela já tem OUTRO pedido em aberto — provável pedido duplo
//   recompra    → já comprou e pagou antes (só informação, não é alerta)
//
// A mesma cliente é reconhecida pelo CÓDIGO do CPF ou do WhatsApp (o dado
// em si não fica no banco). Pedido sem código — os antigos, antes do
// histórico — cai no nome, e aí o alerta avisa que é "só pelo nome".
// ─────────────────────────────────────────────────────────────

import type { Pedido } from '@/types';
import { nomeComparavel, pedidosAtivos } from '@/lib/pedidos';
import { motivoFrustracao, situacaoDoPedido } from '@/lib/indicadores';

export type NivelAlerta = 'roubo' | 'frustracao' | 'duplicado' | 'whatsapp' | 'recompra';
export type PorOnde = 'cpf' | 'telefone' | 'nome';

/** Outro pedido ligado a este. `outroCpf`: mesmo WhatsApp, mas CPF diferente. */
export type OutroPedido = Pick<Pedido, 'status' | 'internal_id' | 'data'> & { outroCpf?: boolean };

export interface AlertaCliente {
  nivel: NivelAlerta;
  por: PorOnde;
  /** Os outros pedidos ligados a este, mais novos primeiro. */
  outros: OutroPedido[];
}

/**
 * O mais grave entre os outros pedidos. Roubo e frustração contam mesmo
 * quando é só o WhatsApp que se repete (golpe troca de nome e CPF). Já
 * "duplicado" e "recompra" só com a MESMA cliente; mesmo WhatsApp com
 * outro CPF vira um aviso próprio — pode ser mãe e filha, pode não ser.
 */
export function nivelDoAlerta(outros: (Pick<Pedido, 'status'> & { outroCpf?: boolean })[]): NivelAlerta | null {
  if (outros.length === 0) return null;
  const sit = outros.map((o) => situacaoDoPedido(o.status));
  if (outros.some((o, i) => sit[i] === 'frustracao' && motivoFrustracao(o) === 'roubo')) return 'roubo';
  if (sit.includes('frustracao')) return 'frustracao';
  const mesma = outros.map((o) => !o.outroCpf);
  if (sit.some((s, i) => mesma[i] && s !== 'pago')) return 'duplicado';
  if (mesma.includes(false)) return 'whatsapp';
  return 'recompra';
}

/** O pedido ainda não se resolveu (nem pago, nem frustrado): dá tempo de agir. */
export function pedidoEmAberto(p: Pick<Pedido, 'status'>): boolean {
  const s = situacaoDoPedido(p.status);
  return s !== 'pago' && s !== 'frustracao';
}

/** Nome bom o bastante para casar sozinho: com sobrenome e 8+ letras. */
function nomeCasavel(nome: string): boolean {
  return nome.length >= 8 && nome.includes(' ');
}

/**
 * Alerta de cada pedido EM ABERTO cuja cliente tem outro pedido aqui
 * (pedidos excluídos da plataforma não contam). Chave: id do pedido.
 */
export function alertasDosPedidos(pedidos: Pedido[]): Map<string, AlertaCliente> {
  const ativos = pedidosAtivos(pedidos);
  const porCpf = new Map<string, Pedido[]>();
  const porTel = new Map<string, Pedido[]>();
  const porNome = new Map<string, Pedido[]>();
  const juntar = (m: Map<string, Pedido[]>, k: string | null | undefined, p: Pedido) => {
    if (!k) return;
    const l = m.get(k);
    if (l) l.push(p);
    else m.set(k, [p]);
  };
  for (const p of ativos) {
    juntar(porCpf, p.cpf_hash, p);
    juntar(porTel, p.tel_hash, p);
    const n = nomeComparavel(p.cliente);
    if (nomeCasavel(n)) juntar(porNome, n, p);
  }

  const alertas = new Map<string, AlertaCliente>();
  for (const p of ativos) {
    if (!pedidoEmAberto(p)) continue;
    const outros = new Map<string, OutroPedido>();
    let por: PorOnde = 'cpf';
    for (const o of porCpf.get(p.cpf_hash ?? '') ?? []) if (o.id !== p.id) outros.set(o.id, o);
    if (outros.size === 0) por = 'telefone';
    for (const o of porTel.get(p.tel_hash ?? '') ?? []) {
      if (o.id === p.id || outros.has(o.id)) continue;
      // Mesmo WhatsApp, CPF diferente: pode ser outra pessoa no mesmo celular.
      outros.set(o.id, { ...o, outroCpf: Boolean(p.cpf_hash && o.cpf_hash && p.cpf_hash !== o.cpf_hash) });
    }
    if (outros.size === 0) {
      // Sem código em comum: só pelo nome, e só com pedidos sem código
      // (dois códigos diferentes = duas clientes diferentes, mesmo nome).
      por = 'nome';
      for (const o of porNome.get(nomeComparavel(p.cliente)) ?? []) {
        if (o.id === p.id) continue;
        const cpfsDiferentes = p.cpf_hash && o.cpf_hash && p.cpf_hash !== o.cpf_hash;
        const telsDiferentes = p.tel_hash && o.tel_hash && p.tel_hash !== o.tel_hash;
        if (!cpfsDiferentes && !telsDiferentes) outros.set(o.id, o);
      }
    }
    const lista = [...outros.values()].sort((a, b) => b.data.localeCompare(a.data));
    const nivel = nivelDoAlerta(lista);
    if (nivel) alertas.set(p.id, { nivel, por, outros: lista });
  }
  return alertas;
}

/** O pedido que motivou o alerta (o roubo, a frustração, o outro em aberto). */
export function pedidoDoMotivo(a: AlertaCliente): OutroPedido | undefined {
  return a.outros.find((o) => {
    const s = situacaoDoPedido(o.status);
    if (a.nivel === 'roubo') return s === 'frustracao' && motivoFrustracao(o) === 'roubo';
    if (a.nivel === 'frustracao') return s === 'frustracao';
    if (a.nivel === 'duplicado') return !o.outroCpf && s !== 'pago' && s !== 'frustracao';
    if (a.nivel === 'whatsapp') return o.outroCpf;
    return s === 'pago';
  });
}

export const ROTULO_ALERTA: Record<NivelAlerta, string> = {
  roubo: 'Já teve roubo',
  frustracao: 'Já frustrou',
  duplicado: 'Pedido duplicado?',
  whatsapp: 'Mesmo WhatsApp, outro CPF',
  recompra: 'Recompra',
};
