// Topo com tendência: série do gráfico e comparação com o período anterior.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import {
  diasDaSerie,
  legendaSerie,
  periodoAnterior,
  rotuloComparacao,
  seloPeriodo,
  serieTendencia,
  variacao,
} from '@/lib/tendencia';
import { calcularPnl } from '@/lib/pnl';
import { haQuanto, resumoDoPeriodo, saudacao } from '@/lib/saudacao';
import { corDaCategoria, PALETA_CATEGORIAS } from '@/lib/cores';

const HOJE = '2026-09-15';

describe('período anterior e variação', () => {
  it('hoje compara com ontem', () => {
    expect(periodoAnterior({ inicio: HOJE, fim: HOJE })).toEqual({ inicio: '2026-09-14', fim: '2026-09-14' });
    expect(rotuloComparacao({ inicio: HOJE, fim: HOJE }, HOJE)).toBe('vs. ontem');
  });

  it('7 dias compara com os 7 dias antes, sem sobrepor', () => {
    expect(periodoAnterior({ inicio: '2026-09-09', fim: HOJE })).toEqual({ inicio: '2026-09-02', fim: '2026-09-08' });
    expect(rotuloComparacao({ inicio: '2026-09-09', fim: HOJE }, HOJE)).toBe('vs. 7 dias anteriores');
  });

  it('um dia que não é hoje compara com o dia anterior', () => {
    expect(rotuloComparacao({ inicio: '2026-09-10', fim: '2026-09-10' }, HOJE)).toBe('vs. dia anterior');
  });

  it('variação: queda de 6.380 para 2.340 é −63%', () => {
    expect(variacao(234_000, 638_000)).toBeCloseTo(-0.633, 3);
  });

  it('sem base para comparar não inventa porcentagem', () => {
    expect(variacao(10_000, 0)).toBeNull();
    expect(variacao(0, 0)).toBe(0);
  });

  it('lucro saindo de prejuízo usa o valor absoluto da base', () => {
    // −100 para +100: subiu 200% sobre a base de 100.
    expect(variacao(10_000, -10_000)).toBeCloseTo(2, 5);
  });
});

describe('selo e legenda', () => {
  it('nomeia os períodos como no topo', () => {
    expect(seloPeriodo({ inicio: HOJE, fim: HOJE }, HOJE)).toBe('Hoje');
    expect(seloPeriodo({ inicio: '2026-09-14', fim: '2026-09-14' }, HOJE)).toBe('Ontem');
    expect(seloPeriodo({ inicio: '2026-09-09', fim: HOJE }, HOJE)).toBe('7 dias');
    expect(seloPeriodo({ inicio: '2026-08-01', fim: '2026-08-31' }, HOJE)).toBe('01/08–31/08');
  });

  it('período curto mostra os últimos 7 dias; longo mostra o período', () => {
    expect(diasDaSerie({ inicio: HOJE, fim: HOJE })).toHaveLength(7);
    expect(diasDaSerie({ inicio: HOJE, fim: HOJE })[6]).toBe(HOJE);
    expect(legendaSerie({ inicio: HOJE, fim: HOJE })).toBe('Últimos 7 dias');
    expect(diasDaSerie({ inicio: '2026-08-17', fim: HOJE })).toHaveLength(30);
    expect(legendaSerie({ inicio: '2026-08-17', fim: HOJE })).toBe('No período');
  });
});

describe('série do gráfico', () => {
  it('cada ponto é o mesmo número que o P&L daquele dia mostra', () => {
    const pedidos: Pedido[] = [
      { id: 'a', status: 'cadastrados', data: '2026-09-14', valor: 735, valor_agendado: 735, produto_plano: 'DERMAX PREMIUM - 6 POTE', vendedor: 'PETER' },
      { id: 'b', status: 'pagos', data: '2026-09-13', data_aprovacao: HOJE, valor: 435, valor_agendado: 435, produto_plano: 'DERMAX PREMIUM - 3 POTE', vendedor: 'PETER' },
    ];
    const serie = serieTendencia([], [], pedidos, { inicio: HOJE, fim: HOJE });
    const dia14 = serie.find((p) => p.data === '2026-09-14')!;
    const dia15 = serie.find((p) => p.data === HOJE)!;

    expect(dia14.agendado).toBe(73_500);
    expect(dia15.aprovado).toBe(43_500);
    // Bate com o P&L do dia, inclusive o lucro.
    expect(dia15.lucro).toBe(calcularPnl([], [], { inicio: HOJE, fim: HOJE }, {}, pedidos).lucro_real);
  });
});

describe('barra do topo', () => {
  it('saúda pelo horário de Brasília', () => {
    expect(saudacao(new Date('2026-09-15T12:00:00Z'))).toBe('Bom dia'); // 09h
    expect(saudacao(new Date('2026-09-15T18:00:00Z'))).toBe('Boa tarde'); // 15h
    expect(saudacao(new Date('2026-09-15T23:30:00Z'))).toBe('Boa noite'); // 20h30
  });

  it('descreve o período escolhido', () => {
    expect(resumoDoPeriodo('hoje')).toBe('hoje');
    expect(resumoDoPeriodo('mes_passado')).toBe('do mês passado');
  });

  it('diz há quanto tempo os dados foram carregados', () => {
    const t = Date.UTC(2026, 8, 15, 12, 0);
    expect(haQuanto(t, t + 20_000)).toBe('agora');
    expect(haQuanto(t, t + 3 * 60_000)).toBe('há 3 min');
    expect(haQuanto(t, t + 125 * 60_000)).toBe('há 2 h');
  });
});

describe('paleta da marca', () => {
  it('categoria com cor antiga (roxo, ciano) vira um tom dourado', () => {
    expect(PALETA_CATEGORIAS).toContain(corDaCategoria('#a855f7', 0));
    expect(PALETA_CATEGORIAS).toContain(corDaCategoria('#22d3ee', 3));
    expect(corDaCategoria('#d4af37', 5)).toBe('#d4af37'); // a da paleta é respeitada
  });

  it('não sobrou roxo, azul nem rosa no código', () => {
    // Pedido do Jonas: a dashboard é preta com dourado, como a logo.
    // Este teste quebra se alguém reintroduzir as cores antigas.
    const arquivos = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return arquivos(p);
        return /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
      });
    const proibidos = [
      /-(pur|pur2|pur3|blu|pnk|cyan)(?![\w-])/, // classes antigas
      /(#|argb: 'FF)(a855f7|c084fc|7c3aed|60a5fa|f472b6|22d3ee|818cf8|38bdf8|8b5cf6|6366f1|3b82f6|ec4899)\b/i, // HEX (e ARGB do Excel)
    ];
    const achados = arquivos('src').flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linha, i) => ({ f, i: i + 1, linha }))
        .filter(({ linha }) => proibidos.some((re) => re.test(linha))),
    );
    expect(achados.map((a) => `${a.f}:${a.i}`)).toEqual([]);
  });
});
