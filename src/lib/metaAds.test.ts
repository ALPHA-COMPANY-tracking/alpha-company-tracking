// Gasto do Meta Ads: busca, conversão do dólar e soma por dia.
import { describe, expect, it } from 'vitest';
import {
  buscarContas,
  buscarContasPorId,
  buscarGastoConta,
  COTACAO_BLUESALES,
  type ContaCadastrada,
  buscarPtax,
  consolidar,
  cotacaoNaData,
  diasEntre,
  gastoMetaPorDia,
  lerCadastro,
  lerIds,
  limparToken,
  mesclarCadastro,
  normalizarConta,
  tokensDasContas,
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

describe('contas de anúncio', () => {
  it('lista as contas com moeda e status, em ordem de nome, seguindo a paginação', async () => {
    const { f, chamadas } = fetchFalso([
      [/after=P2/, { data: [{ name: 'ANUNCIOS GREEN', account_id: '1122006140000052', currency: 'BRL', account_status: 1 }] }],
      [
        /adaccounts/,
        {
          data: [
            { name: 'CA 02', account_id: '3036837756510015', currency: 'USD', account_status: 2, business: { name: 'Valentin Wafer' } },
            { name: 'BM 03 - Valentin_Wafer 01', account_id: '652943883845467', currency: 'USD', account_status: 1 },
          ],
          paging: { next: 'https://graph.facebook.com/v23.0/me/adaccounts?after=P2' },
        },
      ],
    ]);
    const contas = await buscarContas({ fetch: f, token: 't' });
    expect(contas.map((c) => c.nome)).toEqual(['ANUNCIOS GREEN', 'BM 03 - Valentin_Wafer 01', 'CA 02']);
    expect(contas[0]).toMatchObject({ id: '1122006140000052', moeda: 'BRL', ativa: true, status: 'Ativa' });
    expect(contas[2]).toMatchObject({ moeda: 'USD', ativa: false, status: 'Desativada', business: 'Valentin Wafer' });
    expect(decodeURIComponent(chamadas[0])).toContain('fields=name,account_id,currency,account_status');
  });
});

describe('contas sem permissão de portfólio', () => {
  it('se o Meta recusar o campo business, lista as contas sem ele', async () => {
    const { f, chamadas } = fetchFalso([
      [/business/, { error: { message: '(#100) Requires business_management permission to access the field.' } }, 400],
      [/adaccounts/, { data: [{ name: 'BM 03 - Valentin_Wafer 01', account_id: '652943883845467', currency: 'USD', account_status: 1 }] }],
    ]);
    const contas = await buscarContas({ fetch: f, token: 't' });
    expect(contas).toEqual([
      { id: '652943883845467', nome: 'BM 03 - Valentin_Wafer 01', moeda: 'USD', ativa: true, status: 'Ativa', business: null },
    ]);
    expect(chamadas).toHaveLength(2);
  });
});

describe('Importar BM', () => {
  it('lê a lista de Account IDs como no BlueSales (vírgula, linha, espaço; com ou sem act_)', () => {
    expect(lerIds('952267262682097, 977061094944541\n1625020658615806  act_1771380094270327,952267262682097')).toEqual([
      '952267262682097',
      '977061094944541',
      '1625020658615806',
      '1771380094270327',
    ]);
    expect(lerIds('')).toEqual([]);
    expect(lerIds(['act_1', '2'])).toEqual(['1', '2']);
  });

  it('limpa o token colado com aspas, espaço ou Bearer', () => {
    expect(limparToken(' "Bearer EAAabc123\n" ')).toBe('EAAabc123');
    expect(limparToken(undefined)).toBe('');
  });

  it('busca nome, moeda e status de cada conta; a sem acesso vem com o motivo, sem o token', async () => {
    const { f, chamadas } = fetchFalso([
      [/act_952267262682097\?/, { name: 'CA 2', currency: 'BRL', account_status: 1, business: { name: 'AeJ ALPHA company LTDA.' } }],
      [/act_1771380094270327\?/, { name: 'CA 7', currency: 'USD', account_status: 2 }],
      [
        /act_999\?/,
        { error: { message: "Unsupported get request. Object with ID 'act_999' does not exist, cannot be loaded due to missing permissions" } },
        400,
      ],
    ]);
    const r = await buscarContasPorId({ fetch: f, token: 'SEGREDO', ids: ['952267262682097', '1771380094270327', '999'] });
    expect(r[0]).toEqual({
      id: '952267262682097',
      ok: true,
      conta: { id: '952267262682097', nome: 'CA 2', moeda: 'BRL', ativa: true, status: 'Ativa', business: 'AeJ ALPHA company LTDA.' },
    });
    expect(r[1]).toMatchObject({ ok: true, conta: { nome: 'CA 7', moeda: 'USD', ativa: false, status: 'Desativada' } });
    expect(r[2]).toEqual({ id: '999', ok: false, erro: 'o token não tem acesso a esta conta (atribua a conta ao usuário do sistema na BM)' });
    expect(JSON.stringify(r)).not.toContain('SEGREDO');
    expect(decodeURIComponent(chamadas[0])).toContain('fields=name,account_id,currency,account_status,business{name}');
  });

  it('token inválido vira mensagem clara', async () => {
    const { f } = fetchFalso([[/act_1\?/, { error: { message: 'Invalid OAuth access token - Cannot parse access token' } }, 400]]);
    const [r] = await buscarContasPorId({ fetch: f, token: 't', ids: ['1'] });
    expect(r).toEqual({ id: '1', ok: false, erro: 'token inválido ou expirado — gere um novo na BM' });
  });

  it('sem permissão de portfólio, busca a conta sem o campo business', async () => {
    const { f, chamadas } = fetchFalso([
      [/business/, { error: { message: '(#100) Requires business_management permission to access the field.' } }, 400],
      [/act_1\?/, { name: 'CA 9', currency: 'BRL', account_status: 1 }],
    ]);
    const [r] = await buscarContasPorId({ fetch: f, token: 't', ids: ['1'] });
    expect(r).toMatchObject({ ok: true, conta: { nome: 'CA 9', business: null } });
    expect(chamadas).toHaveLength(2);
  });

  const conta = (id: string, nome: string, bm_id: string | null): ContaCadastrada => ({
    id,
    nome,
    moeda: 'BRL',
    status: 'Ativa',
    ativa: true,
    business: null,
    bm_id,
    origem: 'bm',
  });

  it('cadastrar de novo a mesma conta substitui; o cadastro fica em ordem de nome', () => {
    const atual = [conta('1', 'CA 9', null), conta('2', 'BM 03', null)];
    const novo = mesclarCadastro(atual, [conta('1', 'CA 9', '128917744882478'), conta('3', 'CA 2', '128917744882478')]);
    expect(novo.map((c) => [c.nome, c.bm_id])).toEqual([
      ['BM 03', null],
      ['CA 2', '128917744882478'],
      ['CA 9', '128917744882478'],
    ]);
  });

  it('cadastro do banco: descarta lixo e completa o nome', () => {
    expect(lerCadastro(null)).toEqual([]);
    expect(lerCadastro([{ id: 'act_5', moeda: 'usd' }, { nome: 'sem id' }])).toEqual([
      { id: '5', nome: 'Conta 5', moeda: 'USD', status: '', ativa: true, business: null, bm_id: null, origem: 'bm' },
    ]);
  });

  it('cada conta usa o token da sua BM; sem BM, o da Vercel; sem nenhum, avisa', () => {
    const cadastro = [conta('1', 'CA 2', '128'), conta('2', 'BM 03', null), conta('3', 'CA 4', '777')];
    const tokensBm = new Map([['128', 'EAA-bm128']]);
    expect(tokensDasContas({ contas: ['1', '2', '3'], cadastro, tokensBm, tokenVercel: 'EAA-vercel' })).toEqual({
      tokens: { '1': 'EAA-bm128', '2': 'EAA-vercel', '3': 'EAA-vercel' },
      faltando: [],
    });
    expect(tokensDasContas({ contas: ['1', '2'], cadastro, tokensBm, tokenVercel: null })).toEqual({
      tokens: { '1': 'EAA-bm128' },
      faltando: ['2'],
    });
  });

  it('o gasto de cada conta é pedido com o token dela', async () => {
    const { f, chamadas } = fetchFalso([
      [/act_1\/insights/, { data: [{ spend: '100', account_currency: 'USD', date_start: '2026-09-25' }] }],
      [/act_2\/insights/, { data: [{ spend: '200', account_currency: 'BRL', date_start: '2026-09-25' }] }],
    ]);
    const dias = await gastoMetaPorDia({
      fetch: f,
      token: 'EAA-vercel',
      tokens: { '2': 'EAA-bm128' },
      contas: ['1', '2'],
      desde: '2026-09-25',
      ate: '2026-09-25',
      cotacaoFixa: 5.4,
      impostoBrlPct: 12.5,
    });
    expect(chamadas[0]).toContain('access_token=EAA-vercel');
    expect(chamadas[1]).toContain('access_token=EAA-bm128');
    expect(dias[0].reais).toBe(765); // 100 × 5,40 + 200 × 1,125
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

  it('cotação do BlueSales (R$ 5,40) reproduz os valores dele no centavo', () => {
    // Setembro/2026: US$ do Meta → R$ mostrado no BlueSales.
    const casos: [string, number, number][] = [
      ['2026-09-16', 429.83, 2321.08],
      ['2026-09-17', 400.44, 2162.38],
      ['2026-09-18', 466.7, 2520.18],
      ['2026-09-19', 613.89, 3315.01],
      ['2026-09-21', 498.39, 2691.31],
    ];
    const dias = consolidar({
      gastos: casos.map(([data, valor]) => ({ conta: '1', moeda: 'USD', data, valor })),
      dias: casos.map(([data]) => data),
      cotacao: () => COTACAO_BLUESALES,
    });
    expect(dias.map((d) => d.reais)).toEqual(casos.map(([, , reais]) => reais));
  });

  it('imposto do Meta (12,5%) só nas contas em real; dólar não paga', () => {
    const dias = consolidar({
      gastos: [
        { conta: '1', moeda: 'USD', data: '2026-09-24', valor: 100 },
        { conta: '2', moeda: 'BRL', data: '2026-09-24', valor: 200 },
      ],
      dias: ['2026-09-24'],
      cotacao: () => 5.4,
      impostoBrlPct: 12.5,
    });
    const [usd, brl] = dias[0].partes;
    expect(usd).toMatchObject({ reais: 540 }); // 100 × 5,40, sem imposto
    expect(usd.imposto).toBeUndefined();
    expect(brl).toMatchObject({ reais: 225, imposto: 12.5 }); // 200 × 1,125
    expect(dias[0].reais).toBe(765);
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
