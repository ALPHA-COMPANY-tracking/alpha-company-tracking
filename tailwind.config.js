/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Celulares bem estreitos: abaixo disso alguns elementos encolhem
      // (ex.: o ícone do KPI some para o número caber inteiro).
      screens: { xs: '400px' },
      colors: {
        // Neutros vêm de variáveis CSS para o modo claro funcionar.
        // Ver :root e :root.tema-claro em src/index.css.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        card2: 'rgb(var(--card2) / <alpha-value>)',
        card3: 'rgb(var(--card3) / <alpha-value>)',
        chip: 'rgb(var(--chip) / <alpha-value>)',
        trilha: 'rgb(var(--trilha) / <alpha-value>)',
        hover: 'rgb(var(--hover) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        line2: 'rgb(var(--line2) / <alpha-value>)',
        tx: 'rgb(var(--tx) / <alpha-value>)',
        tx2: 'rgb(var(--tx2) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        dim2: 'rgb(var(--dim2) / <alpha-value>)',
        // Marca: dourado (variável CSS — escurece no modo claro).
        gold: 'rgb(var(--gold) / <alpha-value>)',
        gold2: 'rgb(var(--gold2) / <alpha-value>)',
        gold3: 'rgb(var(--gold3) / <alpha-value>)',
        // Semânticas: só onde a cor tem significado.
        grn: '#34d399', // entrou / melhorou
        red: '#fb7185', // saiu / piorou
        yel: '#fbbf24', // aviso
        // Roxo, azul, rosa e ciano foram REMOVIDOS de propósito: não são
        // cores da marca. Uma classe text-pur2 esquecida simplesmente não
        // gera CSS — o grep em src/ tem que voltar vazio.
      },
      fontFamily: {
        // Poppins em tudo, igual ao BlueSales. 'mono' mantido como nome
        // porque marca os números (com algarismos de largura fixa).
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['Poppins', 'system-ui', 'sans-serif'],
      },
      // A Poppins já é compacta: o "tight" padrão (-0.025em) grudava as
      // palavras dos títulos ("Demonstrativode Resultados").
      letterSpacing: {
        tight: '-0.01em',
        tighter: '-0.015em',
      },
      borderRadius: {
        kpi: '14px',
        card: '16px',
        icon: '11px',
      },
    },
  },
  plugins: [],
};
