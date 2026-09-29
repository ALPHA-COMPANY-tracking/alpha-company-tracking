// Alerta de Clientes: código do CPF/WhatsApp, pedido duplicado e cliente
// que já roubou ou frustrou.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { alertasDosPedidos, nivelDoAlerta, pedidoDoMotivo } from '@/lib/clientes';
import { lerClientesDoCsv } from '@/lib/csvBluesales';
import {
  codigosDe,
  codigosDoPayload,
  nivelDoAlerta as nivelServidor,
  normalizarCpf,
  normalizarTelefone,
  textoDoAlerta,
} from '../../api/lib-cliente';

const CHAVE = 'chave-de-teste';

describe('código do CPF e do WhatsApp', () => {
  it('o mesmo CPF/telefone escrito de jeitos diferentes dá o mesmo código', () => {
    expect(normalizarCpf('123.456.789-09')).toBe('12345678909');
    expect(normalizarCpf('123')).toBeNull();
    expect(normalizarTelefone('+55 (11) 9 9876-5432')).toBe('1198765432');
    expect(normalizarTelefone('11998765432')).toBe('1198765432');
    expect(normalizarTelefone('1198765432')).toBe('1198765432'); // sem o 9
    expect(normalizarTelefone('9876-5432')).toBeNull(); // sem DDD não casa
    const a = codigosDe(CHAVE, '123.456.789-09', '5511998765432');
    const b = codigosDe(CHAVE, '12345678909', '(11) 99876-5432');
    expect(a).toEqual(b);
    expect(a.cpf_hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('o código não carrega o CPF e muda com outra chave', () => {
    const a = codigosDe(CHAVE, '12345678909', null);
    expect(a.cpf_hash).not.toContain('12345678909');
    expect(codigosDe('outra-chave', '12345678909', null).cpf_hash).not.toBe(a.cpf_hash);
    expect(a.tel_hash).toBeUndefined();
  });

  it('lê CPF e telefone do bloco do cliente do BlueSales', () => {
    const cod = codigosDoPayload(CHAVE, {
      order: { id: 'BLV-1' },
      customer: { name: 'Maria', document: '123.456.789-09', phone: '(11) 99876-5432' },
    });
    expect(cod).toEqual(codigosDe(CHAVE, '12345678909', '11998765432'));
    expect(codigosDoPayload(CHAVE, { order: { id: 'BLV-1' } })).toEqual({});
  });

  it('servidor: roubo > frustração > duplicado > recompra, com o número no aviso', () => {
    const roubo = [{ internal_id: 1296, status: 'roubo', data: '2026-09-16' }, { internal_id: 1300, status: 'pagos', data: '2026-09-18' }];
    expect(nivelServidor(roubo)).toBe('roubo');
    expect(textoDoAlerta('roubo', roubo)).toBe('🚨 Cliente com ROUBO no #1296 (16/09) — confirme antes de enviar.');
    expect(nivelServidor([{ status: 'devolvido' }, { status: 'enviados' }])).toBe('frustracao');
    expect(nivelServidor([{ status: 'enviados' }])).toBe('duplicado');
    expect(nivelServidor([{ status: 'pagos' }])).toBe('recompra');
    expect(nivelServidor([])).toBeNull();
  });
});

let n = 0;
const ped = (status: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${++n}`,
  internal_id: n,
  status,
  data: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}`,
  valor: 735,
  valor_agendado: 735,
  vendedor: 'PETER',
  cliente: null,
  ...extra,
});

describe('alertas dos pedidos (dashboard)', () => {
  it('cliente que já roubou: o pedido novo em aberto acende o alerta, pelo CPF', () => {
    const roubado = ped('roubo', { cpf_hash: 'c1', cliente: 'Maria Souza' });
    const novo = ped('cadastrados', { cpf_hash: 'c1', cliente: 'MARIA DE SOUZA' }); // nome diferente, mesmo CPF
    const a = alertasDosPedidos([roubado, novo]);
    expect(a.get(novo.id)).toMatchObject({ nivel: 'roubo', por: 'cpf' });
    expect(pedidoDoMotivo(a.get(novo.id)!)?.internal_id).toBe(roubado.internal_id);
    expect(a.has(roubado.id)).toBe(false); // o pedido roubado já se resolveu
  });

  it('pedido duplicado: dois em aberto com o mesmo WhatsApp', () => {
    const p1 = ped('enviados', { tel_hash: 't1' });
    const p2 = ped('cadastrados', { tel_hash: 't1' });
    const a = alertasDosPedidos([p1, p2]);
    expect(a.get(p2.id)).toMatchObject({ nivel: 'duplicado', por: 'telefone' });
    expect(a.get(p1.id)).toMatchObject({ nivel: 'duplicado' });
  });

  it('recompra de quem pagou é só informação; excluído da plataforma não conta', () => {
    const pago = ped('pagos', { cpf_hash: 'c2' });
    const novo = ped('cadastrados', { cpf_hash: 'c2' });
    const excluido = ped('roubo', { cpf_hash: 'c2', removido_em: '2026-09-20T00:00:00Z' });
    expect(alertasDosPedidos([pago, novo, excluido]).get(novo.id)?.nivel).toBe('recompra');
  });

  it('sem código: casa pelo nome completo — mas nunca contra código diferente', () => {
    const antigo = ped('roubo', { cliente: 'Adelia Pereira Lima' }); // de antes do histórico
    const novo = ped('cadastrados', { cliente: 'ADÉLIA  PEREIRA LIMA', cpf_hash: 'c3' });
    expect(alertasDosPedidos([antigo, novo]).get(novo.id)).toMatchObject({ nivel: 'roubo', por: 'nome' });

    const outraMaria = ped('roubo', { cliente: 'Maria da Silva', cpf_hash: 'c4' });
    const maria = ped('cadastrados', { cliente: 'Maria da Silva', cpf_hash: 'c5' });
    expect(alertasDosPedidos([outraMaria, maria]).has(maria.id)).toBe(false);

    const soPrimeiroNome = ped('roubo', { cliente: 'Ana' });
    const outraAna = ped('cadastrados', { cliente: 'Ana' });
    expect(alertasDosPedidos([soPrimeiroNome, outraAna]).has(outraAna.id)).toBe(false);
  });

  it('mesmo WhatsApp com outro CPF: aviso próprio — mas roubo continua roubo', () => {
    // O caso de 21/09: duas clientes, nomes e CPFs diferentes, o mesmo WhatsApp.
    const elizabete = ped('cobrados', { tel_hash: 't9', cpf_hash: 'cA' });
    const maria = ped('saiu_para_entrega', { tel_hash: 't9', cpf_hash: 'cB' });
    const a = alertasDosPedidos([elizabete, maria]);
    expect(a.get(maria.id)).toMatchObject({ nivel: 'whatsapp', por: 'telefone' });
    expect(pedidoDoMotivo(a.get(maria.id)!)?.internal_id).toBe(elizabete.internal_id);

    const ladra = ped('roubo', { tel_hash: 't8', cpf_hash: 'cC' });
    const novoNome = ped('cadastrados', { tel_hash: 't8', cpf_hash: 'cD' });
    expect(alertasDosPedidos([ladra, novoNome]).get(novoNome.id)?.nivel).toBe('roubo');

    expect(nivelServidor([{ status: 'enviados', outroCpf: true }])).toBe('whatsapp');
    expect(nivelServidor([{ status: 'roubo', outroCpf: true }])).toBe('roubo');
  });

  it('frustração vale mais que pedido em aberto', () => {
    expect(nivelDoAlerta([{ status: 'enviados' }, { status: 'voltando' }])).toBe('frustracao');
  });
});

describe('histórico pelo CSV', () => {
  it('lê só número, CPF e WhatsApp', () => {
    const csv =
      'ID,Codigo,Nome,CPF,WhatsApp,Email,Rua,Cidade,Estado\n' +
      '1296,BLV-1,Maria,123.456.789-09,5511998765432,m@x.com,"Rua A, 1",Campinas,SP\n' +
      '1297,BLV-2,Joana,,,,Rua B,Santos,SP\n';
    const r = lerClientesDoCsv(csv);
    expect(r.itens).toEqual([{ internal_id: 1296, cpf: '123.456.789-09', telefone: '5511998765432' }]);
    expect(r.linhas).toBe(2);
    expect(JSON.stringify(r)).not.toMatch(/Maria|m@x\.com|Rua A|Campinas/);
  });
});
