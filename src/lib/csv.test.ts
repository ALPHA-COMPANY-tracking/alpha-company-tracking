import { describe, expect, it } from 'vitest';
import type { CategoriaCusto } from '@/types';
import { parseCsvCustos } from '@/lib/csv';

const cats: CategoriaCusto[] = [
  { id: 'cat-chips', nome: 'Chips / Números WhatsApp', ativo: true, ordem: 0 },
  { id: 'cat-ferr', nome: 'Ferramentas e SaaS', ativo: true, ordem: 1 },
  { id: 'cat-outros', nome: 'Outros', ativo: true, ordem: 2 },
];

describe('parseCsvCustos', () => {
  it('lê CSV com ; e valores BR, pulando cabeçalho', () => {
    const csv = `data;categoria;descricao;valor
2026-08-20;Chips / Números WhatsApp;Chip novo;60,00
20/08/2026;Ferramentas e SaaS;Assinatura design;1.234,56`;
    const r = parseCsvCustos(csv, cats);
    expect(r).toHaveLength(2);
    expect(r[0].ok).toBe(true);
    expect(r[0].custo).toMatchObject({ data: '2026-08-20', categoria_id: 'cat-chips', valor: 60 });
    expect(r[1].custo).toMatchObject({ data: '2026-08-20', categoria_id: 'cat-ferr', valor: 1234.56 });
  });

  it('categoria desconhecida cai em Outros; data inválida vira erro', () => {
    const csv = `2026-08-20;Categoria Inexistente;X;10,00
data-ruim;Outros;Y;5,00`;
    const r = parseCsvCustos(csv, cats);
    expect(r[0].custo?.categoria_id).toBe('cat-outros');
    expect(r[1].ok).toBe(false);
    expect(r[1].erro).toContain('Data inválida');
  });

  it('aceita separador vírgula com decimal em ponto', () => {
    const r = parseCsvCustos('2026-01-05,Outros,Teste,99.90', cats);
    expect(r[0].ok).toBe(true);
    expect(r[0].custo?.valor).toBe(99.9);
  });
});
