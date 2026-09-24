// Gasto do Meta Ads: busca, conversão do dólar e soma por dia.
import { describe, expect, it } from 'vitest';
import {
  buscarGastoConta,
  buscarPtax,
  consolidar,
  cotacaoNaData,
  diasEntre,
  gastoMetaPorDia,
  normalizarConta,
} from '../../api/lib-meta';

/** fetch falso: responde conforme o trecho da URL. */
function fetchFalso(respostas: [RegExp, unknown, number?][]) {
  const chamadas: string[] = [];
  const f = async (url: string) => {
    chamadas.push(url);
    const r = respostas.find(([re]) => re.test(url));
    if (!r) throw new Error('URL inesperada: ' + url);
    return { ok: (r[2] ?? 200) < 400, status: r[2] ?? 200, json: async () => r[1] };
  };
  return { f, chamadas };
}

describe('contas e datas', () => {
  it('aceita a conta com ou sem act_', () => {
    expect(normalizarConta('act_123456789')).toBe('123456789');
    expect(normalizarConta(' 123456789 ')).toBe('123456789');
  });

  it('lista os dias do período', () => {
    expect(diasEntre('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('Meta', () => {
  it('lê o gasto diário e segue a paginação', async () => {
    const { f, chamadas } = fetchFalso([
      [/after=PAG2/, { data: [{ spend: '100.50', account_currency: 'USD', date_start: '2026-09-22' }] }],
      [
        /insights/,
        {
          data: [{ spend: '432.10', account_currency: 'USD', date_start: '2026-09-21' }],
          paging: { next: 'https://graph.facebook.com/v23.0/act_1/insights?after=PAG2' },
        },
      ],
    ]);
    const r = await buscarGastoConta({ fetch: f, token: 'SEGREDO', conta: 'act_1', desde: '2026-09-21', ate: '2026-09-22' });
    expect(r.dias).toEqual([
      { conta: '1', moeda: 'USD', data: '2026-09-21', valor: 432.1 },
      { conta: '1', moeda: 'USD', data: '2026-09-22', valor: 100.5 },
    ]);
    expect(chamadas[0]).toContain('time_increment=1');
    expect(decodeURIComponent(chamadas[0])).toContain('"since":"2026-09-21"');
  });

  it('erro do Meta vira mensagem clara — sem vazar o token', async () => {
    const { f } = fetchFalso([[/insights/, { error: { message: 'Invalid OAuth access token.' } }, 400]]);
    const erro = await buscarGastoConta({ fetch: f, token: 'SEGREDO', conta: '1', desde: '2026-09-21', ate: '2026-09-21' }).catch(
      (e: Error) => e.message,
    );
    expect(erro).toBe('Meta (conta 1): Invalid OAuth access token.');
    expect(erro).not.toContain('SEGREDO');
  });
});

describe('dólar', () => {
  it('PTAX: vale a última cotação do dia; fim de semana usa a de sexta', async () => {
    const { f } = fetchFalso([
      [
        /olinda\.bcb\.gov\.br/,
        {
          value: [
            { cotacaoVenda: 5.3, dataHoraCotacao: '2026-09-18 10:05:00.000' },
            { cotacaoVenda: 5.35, dataHoraCotacao: '2026-09-18 13:07:00.000' },
            { cotacaoVenda: 5.4, dataHoraCotacao: '2026-09-21 13:07:00.000' },
          ],
        },
      ],
    ]);
    const cot = await buscarPtax({ fetch: f, desde: '2026-09-19', ate: '2026-09-21' });
    expect(cotacaoNaData(cot, '2026-09-18')).toBe(5.35); // fechamento
    expect(cotacaoNaData(cot, '2026-09-20')).toBe(5.35); // domingo → sexta
    expect(cotacaoNaData(cot, '2026-09-21')).toBe(5.4);
    expect(cotacaoNaData(cot, '2026-09-10')).toBeNull();
  });
});

describe('soma por dia em reais', () => {
  it('converte o dólar, soma as contas e zera o dia sem gasto', () => {
    const dias = consolidar({
      gastos: [
        { conta: '1', moeda: 'USD', data: '2026-09-21', valor: 432.1 },
        { conta: '2', moeda: 'BRL', data: '2026-09-21', valor: 50 },
      ],
      dias: ['2026-09-20', '2026-09-21'],
      cotacao: () => 5.4,
    });
    expect(dias[0]).toEqual({ data: '2026-09-20', reais: 0, partes: [] });
    expect(dias[1].reais).toBe(2383.34); // 432,10 × 5,40 = 2.333,34 + 50,00
    expect(dias[1].partes[0]).toMatchObject({ moeda: 'USD', cotacao: 5.4, reais: 2333.34 });
  });

  it('sem cotação não inventa número', () => {
    expect(() =>
      consolidar({ gastos: [{ conta: '1', moeda: 'USD', data: '2026-09-21', valor: 10 }], dias: ['2026-09-21'], cotacao: () => null }),
    ).toThrow('Sem cotação de USD para 2026-09-21');
  });

  it('cotação fixa com acréscimo (ex.: IOF) dispensa o Banco Central', async () => {
    const { f, chamadas } = fetchFalso([
      [/insights/, { data: [{ spend: '100', account_currency: 'USD', date_start: '2026-09-22' }] }],
    ]);
    const dias = await gastoMetaPorDia({
      fetch: f,
      token: 't',
      contas: ['1'],
      desde: '2026-09-22',
      ate: '2026-09-22',
      cotacaoFixa: 5,
      acrescimoPct: 3.5,
    });
    expect(dias[0].reais).toBe(517.5); // 100 × 5 × 1,035
    expect(chamadas.some((u) => u.includes('bcb.gov.br'))).toBe(false);
  });
});
