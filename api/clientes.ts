// ─────────────────────────────────────────────────────────────
// Alerta de Clientes.
//
//   POST /api/clientes?acao=verificar   { cpf?, telefone? }
//        Antes de agendar: a cliente já tem pedido aqui? Devolve os
//        pedidos com o mesmo CPF/WhatsApp e o alerta (roubo, frustração,
//        duplicado, recompra). Dono, sócio ou vendedor.
//   POST /api/clientes?acao=historico   { itens: [{ internal_id, cpf, telefone }] }
//        Uma vez, pelo CSV do BlueSales: grava o CÓDIGO do CPF/WhatsApp
//        dos pedidos antigos. Só dono ou sócio.
//
// O CPF e o telefone chegam, viram código (api/lib-cliente.ts) e são
// descartados: não vão para o banco nem para log nenhum.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const aviso = (texto: string) => res.status(200).json({ ok: false, aviso: texto });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const donoId = process.env.DASHBOARD_USER_ID;
    if (!donoId) return aviso('DASHBOARD_USER_ID não configurado.');
    const [{ createClient }, lib] = await Promise.all([import('@supabase/supabase-js'), import('./lib-cliente.js')]);
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    // Quem é: dono, sócio ou vendedor.
    const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    const { data: sessao } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const quem = sessao.user?.id;
    if (!quem) return res.status(401).json({ error: 'Não autorizado' });
    let papel: 'dono' | 'vendedor' | null = quem === donoId ? 'dono' : null;
    if (!papel) {
      const { data: m } = await db.from('dashboard_membros').select('dono_id').eq('membro_id', quem).eq('dono_id', donoId).maybeSingle();
      if (m) papel = 'dono';
    }
    if (!papel) {
      const { data: v } = await db.from('dashboard_vendedores').select('dono_id').eq('membro_id', quem).eq('dono_id', donoId).maybeSingle();
      if (v) papel = 'vendedor';
    }
    if (!papel) return res.status(401).json({ error: 'Não autorizado' });

    const chave = process.env.CLIENTE_HASH_KEY;
    if (!chave) return aviso('Falta configurar a chave CLIENTE_HASH_KEY na Vercel.');

    const acao = typeof req.query.acao === 'string' ? req.query.acao : '';
    const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>;

    if (acao === 'verificar') {
      const cod = lib.codigosDe(chave, corpo.cpf, corpo.telefone);
      if (!cod.cpf_hash && !cod.tel_hash) return aviso('Digite um CPF (11 números) ou um WhatsApp com DDD.');
      const filtros = [cod.cpf_hash && `cpf_hash.eq.${cod.cpf_hash}`, cod.tel_hash && `tel_hash.eq.${cod.tel_hash}`]
        .filter(Boolean)
        .join(',');
      const { data, error } = await db
        .from('bluesales_pedidos')
        .select('internal_id,status,data,valor_agendado,valor,vendedor,cpf_hash,tel_hash')
        .eq('user_id', donoId)
        .is('removido_em', null)
        .or(filtros)
        .order('data', { ascending: false })
        .limit(30);
      if (error) {
        return aviso(/cpf_hash|tel_hash/.test(error.message) ? 'Rode a migração 0022 no Supabase primeiro.' : 'Banco: ' + error.message);
      }
      const pedidos = (data ?? []).map((p) => ({
        numero: p.internal_id,
        status: p.status,
        data: p.data,
        valor: Number(p.valor_agendado ?? p.valor) || 0,
        // O vendedor só aparece para o dono/sócio.
        ...(papel === 'dono' ? { vendedor: p.vendedor } : {}),
        por: cod.cpf_hash && p.cpf_hash === cod.cpf_hash ? 'cpf' : 'telefone',
      }));
      return res.status(200).json({ ok: true, nivel: lib.nivelDoAlerta(pedidos), pedidos });
    }

    if (acao === 'historico') {
      if (papel !== 'dono') return res.status(401).json({ error: 'Só o dono ou um sócio grava o histórico.' });
      const itens = Array.isArray(corpo.itens) ? (corpo.itens as Record<string, unknown>[]) : [];
      if (itens.length === 0 || itens.length > 1000) return aviso('Mande de 1 a 1000 pedidos por vez.');
      const codigos = itens
        .map((i) => ({ internal_id: Number(i.internal_id), ...lib.codigosDe(chave, i.cpf, i.telefone) }))
        .filter((i) => i.internal_id > 0 && (i.cpf_hash || i.tel_hash));
      const { data, error } = await db.rpc('definir_codigos_cliente', { conta: donoId, itens: codigos });
      if (error) {
        return aviso(/definir_codigos_cliente|function/i.test(error.message) ? 'Rode a migração 0022 no Supabase primeiro.' : 'Banco: ' + error.message);
      }
      return res.status(200).json({ ok: true, gravados: Number(data) || 0, com_codigo: codigos.length });
    }

    return aviso('Ação inválida.');
  } catch (e) {
    return aviso(e instanceof Error ? e.message : String(e));
  }
}
