// Texto das notificações de pedido pago / agendado.
import { describe, expect, it } from 'vitest';
import { avisoDoEvento, brl } from '../../server/push';

/** O Intl separa "R$" do número com espaço não-quebrável. */
const norm = (s: string) => s.replace(/ /g, ' ');

describe('avisoDoEvento', () => {
  it('pagamento aprovado traz o valor e o nome de quem pagou', () => {
    const a = avisoDoEvento('ORDER_PAID', 'pagos', 'PETER', 735, 'YOLANDA DE GOIS')!;
    expect(norm(a.titulo)).toContain('R$ 735,00');
    expect(a.titulo).toContain('Pagamento aprovado');
    expect(a.corpo).toBe('YOLANDA DE GOIS');
    expect(a.tag).toBe('pago');
  });

  it('pagamento sem o nome do cliente cai no vendedor', () => {
    const a = avisoDoEvento('ORDER_PAID', 'pagos', 'PETER', 735)!;
    expect(a.corpo).toContain('PETER');
  });

  it('o agendamento mostra o vendedor, não o cliente', () => {
    const a = avisoDoEvento('ORDER_CREATE', 'cadastrados', 'MATHEUS', 735, 'YOLANDA DE GOIS')!;
    expect(a.corpo).toContain('MATHEUS');
    expect(a.corpo).not.toContain('YOLANDA');
  });

  it('agendamento novo traz valor e vendedor', () => {
    const a = avisoDoEvento('ORDER_CREATE', 'cadastrados', 'MATHEUS', 435)!;
    expect(a.titulo).toContain('Novo agendamento');
    expect(norm(a.titulo)).toContain('R$ 435,00');
    expect(a.corpo).toContain('MATHEUS');
    expect(a.tag).toBe('agendado');
  });

  it('pagamento tem prioridade sobre o tipo do evento', () => {
    // Um SHIPPING_UPDATE que chega com status "pagos" ainda é um pagamento.
    const a = avisoDoEvento('SHIPPING_UPDATE', 'Pagos', 'PETER', 735)!;
    expect(a.tag).toBe('pago');
  });

  it('sem vendedor não deixa o texto quebrado', () => {
    const a = avisoDoEvento('ORDER_CREATE', 'cadastrados', null, 735)!;
    expect(a.corpo).toContain('Sem atendente');
  });

  it('envio e cobrança não viram notificação', () => {
    expect(avisoDoEvento('SHIPPING_UPDATE', 'enviados', 'PETER', 735)).toBeNull();
    expect(avisoDoEvento('CHARGE_UPDATE', 'cobrados', 'PETER', 735)).toBeNull();
    expect(avisoDoEvento('ORDER_DELIVERED_CARD', 'entregues', 'PETER', 735)).toBeNull();
  });

  it('formata o valor em reais', () => {
    expect(norm(brl(735))).toBe('R$ 735,00');
    expect(norm(brl(1234.5))).toBe('R$ 1.234,50');
  });
});
