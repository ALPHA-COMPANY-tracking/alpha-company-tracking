// Tema claro/escuro. A classe `tema-claro` no <html> troca as variáveis
// de cor definidas em index.css. A escolha fica salva no aparelho.
import { useCallback, useEffect, useState } from 'react';

export type Tema = 'escuro' | 'claro';

const CHAVE = 'ajalpha:tema';

function temaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'claro' ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle('tema-claro', tema === 'claro');
  // Barra de status do celular acompanha o fundo.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#f4f5f8' : '#141419');
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(temaSalvo);

  useEffect(() => {
    aplicar(tema);
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* modo privado: só não persiste */
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === 'claro' ? 'escuro' : 'claro')), []);

  return { tema, alternar, claro: tema === 'claro' };
}
