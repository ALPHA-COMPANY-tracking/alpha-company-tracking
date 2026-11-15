// Conferência com o export do BlueSales — as regras das conferências por SQL
// de 22/10 a 12/11/2026, agora num botão da dashboard (15/11/2026).
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { aplicarMudancas, conferirComExport, correcoesPorPedido, lerExportBlueSales, periodoDoExport } from '@/lib/conferenciaExport';

const CAB = 'ID,Codigo,Nome,CPF,WhatsApp,Email,Produto,Plano,Valor,Desconto,Forma Pagamento,Vendedor,Etapa,Rua,Data Pedido,Pago Em,Tipo de venda';
const linha = (n: number, cod: string, etapa: string, valor: string, desconto: string, data: string, pago = '') =>
  `${n},${cod},Fulana,000.000.000-00,(11) 9,x@y.com,DERMAX,"DERMAX - 3 POTE",\"${valor}\",\"${desconto}\",pix,PETER,${etapa},"Rua A, 1","${data}, 10:00:00",${pago ? `"${pago}, 11:00:00"` : ''},Afterpay`;

const CSV = [
  CAB,
  linha(10, 'BLV-AAA', 'Aguard. Coleta', '435,00', '0,00', '02/11/2026'),
  linha(11, 'BLV-BBB', 'Enviados', '735,00', '35,00', '02/11/2026'),
  linha(12, 'BLV-CCC', 'Recusados', '735,00', '0,00', '03/11/2026'),
  linha(13, 'BLV-DDD', 'Cancelados', '535,00', '0,00', '03/11/2026'),
  linha(14, 'BLV-EEE', 'Pagos', '435,00', '0,00', '03/11/2026', '05/11/2026'),
  linha(15, 'BLV-FFF', 'Agendados', '400,00', '0,00', '04/11/2026'),
].join('\n');

const P: Periodo = { inicio: '2026-11-01', fim: '2026-11-04' };
const EXPORTADO = new Date('2026-11-04T20:00:00-03:00');

const ped = (id: string, status: string, valor: number, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  internal_id: Number(id.length),
  status,
  data: '2026-11-02',
  valor,
  valor_agendado: valor,
  ...extra,
});

describe('lerExportBlueSales', () => {
  it('lê só número, código, etapa, valor − desconto e datas', () => {
    const l = lerExportBlueSales(CSV);
    expect(l).toHaveLength(6);
    expect(l[1]).toEqual({ numero: 11, codigo: 'BLV-BBB', etapa: 'Enviados', valor: 700, data: '2026-11-02', pago_em: null, tipo: 'Afterpay' });
    expect(l[4].pago_em).toBe('2026-11-05');
    expect(Object.keys(l[0])).not.toContain('cpf');
  });

  it('arquivo que não é o export: erro claro', () => {
    expect(() => lerExportBlueSales('Nome,Telefone\nFulana,11')).toThrow(/todas as etapas/);
  });

  it('período: o do nome do arquivo (vale até dia sem pedido); sem ele, do primeiro ao último pedido', () => {
    const l = lerExportBlueSales(CSV);
    expect(periodoDoExport('pedidos_todas_as_etapas_2026-11-01_2026-11-04.csv', l)).toEqual(P);
    expect(periodoDoExport('pedidos (1).csv', l)).toEqual({ inicio: '2026-11-02', fim: '2026-11-04' });
  });
});

describe('conferirComExport', () => {
  const linhas = lerExportBlueSales(CSV);
  const pedidos: Pedido[] = [
    ped('BLV-AAA', 'aguard_coleta', 435),
    ped('BLV-BBB', 'enviados', 735), // desconto dado depois: 735 → 700
    ped('BLV-CCC', 'enviados', 735, { data: '2026-11-03' }), // recusado lá
    ped('BLV-DDD', 'cancelados', 535, { data: '2026-11-03', removido_em: '2026-11-03T12:00:00Z' }), // na lixeira, mas existe lá
    ped('BLV-EEE', 'pagos', 435, { data: '2026-11-03', data_aprovacao: '2026-11-05' }),
    ped('BLV-APAGADO', 'aguard_coleta', 735, { data: '2026-11-03' }), // apagado no BlueSales
    ped('BLV-PAGO-FORA', 'pagos', 435, { data: '2026-11-02', data_aprovacao: '2026-11-04' }),
    ped('BLV-NOVO', 'cadastrados', 535, { data: '2026-11-04' }), // chegou depois do export
    ped('BLV-OUTUBRO', 'aguard_coleta', 735, { data: '2026-10-30' }), // fora do período: não mexe
  ];
  const chegadas = { 'BLV-NOVO': '2026-11-04T21:30:00-03:00', 'BLV-APAGADO': '2026-11-03T10:00:00-03:00' };
  const conf = conferirComExport(linhas, pedidos, P, EXPORTADO, chegadas);
  const tipos = (t: string) => conf.mudancas.filter((m) => m.tipo === t).map((m) => m.pedido.id);
  const avisos = (t: string) => conf.avisos.filter((a) => a.tipo === t);

  it('apagado no BlueSales vai para a lixeira; pago e o que chegou depois do export, não', () => {
    expect(tipos('lixeira')).toEqual(['BLV-APAGADO']);
    expect(avisos('pago_fora').map((a) => (a as { pedido: Pedido }).pedido.id)).toEqual(['BLV-PAGO-FORA']);
    expect(avisos('chegou_depois').map((a) => (a as { pedido: Pedido }).pedido.id)).toEqual(['BLV-NOVO']);
  });

  it('na lixeira e no BlueSales: volta; valor e etapa: os de lá', () => {
    expect(tipos('voltar')).toEqual(['BLV-DDD']);
    expect(conf.mudancas.find((m) => m.tipo === 'valor')).toMatchObject({ pedido: { id: 'BLV-BBB' }, de: 735, para: 700 });
    expect(conf.mudancas.find((m) => m.tipo === 'etapa')).toMatchObject({ pedido: { id: 'BLV-CCC' }, para: 'recusados' });
    expect(tipos('etapa')).toEqual(['BLV-CCC']); // cancelado já era cancelado; pago não muda
  });

  it('no export sem aviso aqui: só avisa (o "Vendas" do BlueSales só conta depois de confirmado)', () => {
    expect(avisos('falta_aqui').map((a) => (a as { linha: { codigo: string } }).linha.codigo)).toEqual(['BLV-FFF']);
  });

  it('antes, depois e o BlueSales', () => {
    // Antes: AAA 435 + BBB 735 + CCC 735 + EEE 435 + APAGADO 735 + PAGO-FORA 435 + NOVO 535 = 7 · 4.045
    expect(conf.antes).toEqual({ qtd: 7, valor: 4045 });
    // Depois: − APAGADO 735, − CCC (recusado) 735, BBB 700, + DDD 535 = 6 · 3.075
    expect(conf.depois).toEqual({ qtd: 6, valor: 3075 });
    // Export sem o recusado: AAA 435 + BBB 700 + DDD 535 + EEE 435 + FFF 400 = 5 · 2.505
    expect(conf.blueSales).toEqual({ qtd: 5, valor: 2505 });
  });

  it('as correções saem uma por pedido, e o estado depois é o mesmo da conta', () => {
    const c = correcoesPorPedido(conf.mudancas);
    expect(c.get('BLV-APAGADO')).toEqual({ removido: true });
    expect(c.get('BLV-DDD')).toEqual({ removido: false });
    expect(c.get('BLV-BBB')).toEqual({ valor_agendado: 700 });
    expect(c.get('BLV-CCC')).toEqual({ status: 'recusados' });
    const depois = aplicarMudancas(pedidos, conf.mudancas, '2026-11-15T12:00:00Z');
    expect(depois.find((p) => p.id === 'BLV-APAGADO')!.removido_em).toBe('2026-11-15T12:00:00Z');
    expect(depois.find((p) => p.id === 'BLV-OUTUBRO')).toEqual(pedidos.find((p) => p.id === 'BLV-OUTUBRO'));
  });

  it('tudo igual: nada a corrigir', () => {
    const iguais = conferirComExport(linhas, aplicarMudancas(pedidos, conf.mudancas, 'x'), P, EXPORTADO, chegadas);
    expect(iguais.mudancas).toEqual([]);
  });

  it('antecipado já pago não entra no total do BlueSales (como o card) nem no daqui', () => {
    const comAntecipado = CSV + '\n' + linha(16, 'BLV-ANT', 'Entregues', '435,00', '0,00', '04/11/2026', '04/11/2026').replace(',Afterpay', ',Antecipado');
    const l2 = lerExportBlueSales(comAntecipado);
    const aqui = [...aplicarMudancas(pedidos, conf.mudancas, 'x'), ped('BLV-ANT', 'pagos', 435, { data: '2026-11-04', tipo_venda: 'antecipado', data_aprovacao: '2026-11-04' })];
    const r = conferirComExport(l2, aqui, P, EXPORTADO, chegadas);
    expect(r.blueSales).toEqual(conf.blueSales);
    expect(r.depois.valor).toBe(conf.depois.valor);
  });

  it('pagamento: pago lá e não aqui vira aviso, sem mexer', () => {
    const naoPago = pedidos.map((p) => (p.id === 'BLV-EEE' ? { ...p, status: 'entregues', data_aprovacao: null } : p));
    const r = conferirComExport(linhas, naoPago, P, EXPORTADO, chegadas);
    expect(r.avisos.filter((a) => a.tipo === 'pago_la')).toHaveLength(1);
    expect(r.mudancas.some((m) => m.pedido.id === 'BLV-EEE')).toBe(false);
  });
});
