// ─────────────────────────────────────────────────────────────
// Leitura do export do BlueSales ("pedidos_todas_as_etapas_….csv") no
// navegador. Quem chama pega SÓ as colunas de que precisa — o resto do
// arquivo (endereço, e-mail…) nunca sai do computador.
// ─────────────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** CSV com aspas (o endereço tem vírgula e quebra de linha dentro). */
function linhasCsv(texto: string, sep: string): string[][] {
  const out: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      out.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    out.push(linha);
  }
  return out.filter((l) => l.length > 1);
}

/**
 * Cabeçalho + linhas. `coluna('estado')` acha a coluna pelo nome, sem
 * ligar para acento e maiúscula (-1 se não existir).
 */
export function lerCsvBluesales(texto: string): { linhas: string[][]; coluna: (nome: string) => number } {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.slice(0, limpo.search(/\r?\n/) >>> 0);
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const [cab = [], ...linhas] = linhasCsv(limpo, sep);
  const nomes = cab.map((c) => semAcento(c).trim().toLowerCase());
  return { linhas, coluna: (nome) => nomes.indexOf(semAcento(nome).toLowerCase()) };
}

/** Número do pedido (#123) da coluna ID. */
export function numeroDoPedido(v: unknown): number {
  return Number(String(v ?? '').replace(/\D/g, '')) || 0;
}

export interface ClienteDoCsv {
  internal_id: number;
  cpf: string;
  telefone: string;
}

/**
 * Para o histórico do Alerta de Clientes: número do pedido, CPF e WhatsApp.
 * Vão ao servidor só para virar CÓDIGO — lá eles são descartados.
 */
export function lerClientesDoCsv(texto: string): { itens: ClienteDoCsv[]; linhas: number } {
  const { linhas, coluna } = lerCsvBluesales(texto);
  const iId = coluna('id');
  const iCpf = coluna('cpf');
  const iTel = [coluna('whatsapp'), coluna('telefone'), coluna('celular')].find((i) => i >= 0) ?? -1;
  if (iId < 0 || (iCpf < 0 && iTel < 0)) {
    throw new Error('O arquivo não tem as colunas ID, CPF e WhatsApp — use o export "todas as etapas" do BlueSales.');
  }
  const itens: ClienteDoCsv[] = [];
  for (const l of linhas) {
    const id = numeroDoPedido(l[iId]);
    const cpf = iCpf >= 0 ? String(l[iCpf] ?? '').trim() : '';
    const telefone = iTel >= 0 ? String(l[iTel] ?? '').trim() : '';
    if (id && (cpf || telefone)) itens.push({ internal_id: id, cpf, telefone });
  }
  return { itens, linhas: linhas.length };
}
