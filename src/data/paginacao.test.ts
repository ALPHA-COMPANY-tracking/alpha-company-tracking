// O Supabase devolve no máximo 1000 linhas por chamada e corta o resto sem
// avisar. A carga dos pedidos busca de página em página (15/11/2026).
import { describe, expect, it } from 'vitest';
import { todasAsLinhas } from '@/data/supabaseBackend';

/** Banco de mentira com o mesmo corte de 1000 do Supabase. */
function banco(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidas: [number, number][] = [];
  const pagina = async (de: number, ate: number) => {
    pedidas.push([de, ate]);
    return { data: linhas.slice(de, Math.min(ate + 1, de + 1000)), error: null };
  };
  return { pagina, pedidas };
}

describe('todasAsLinhas', () => {
  it('traz tudo quando passa de 1000 (antes ficavam só as 1000 mais recentes)', async () => {
    const b = banco(2_345);
    const r = await todasAsLinhas(b.pagina);
    expect(r.data).toHaveLength(2_345);
    expect(r.data[2_344]).toEqual({ id: 2_344 });
    expect(b.pedidas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('exatamente 1000: pede mais uma página e para na vazia', async () => {
    const b = banco(1000);
    expect((await todasAsLinhas(b.pagina)).data).toHaveLength(1000);
    expect(b.pedidas).toHaveLength(2);
  });

  it('erro numa página: devolve o erro (a tela avisa) e o que já veio', async () => {
    let n = 0;
    const r = await todasAsLinhas(async () =>
      ++n === 1 ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null } : { data: null, error: { message: 'caiu' } },
    );
    expect(r.error?.message).toBe('caiu');
    expect(r.data).toHaveLength(1000);
  });
});
