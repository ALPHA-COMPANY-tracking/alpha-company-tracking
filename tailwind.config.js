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
        pur: '#a855f7',
        pur2: '#c084fc',
        pur3: '#7c3aed',
        grn: '#34d399',
        blu: '#60a5fa',
        pnk: '#f472b6',
        yel: '#fbbf24',
        red: '#fb7185',
        cyan: '#22d3ee',
        gold: '#d4af37',
        gold2: '#f0d98f',
        gold3: '#a8792e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
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
