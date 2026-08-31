/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Celulares bem estreitos: abaixo disso alguns elementos encolhem
      // (ex.: o ícone do KPI some para o número caber inteiro).
      screens: { xs: '400px' },
      colors: {
        bg: '#141419',
        card: '#1c1c24',
        card2: '#20202a',
        line: '#2a2a35',
        line2: '#33333f',
        tx: '#eaeaf2',
        dim: '#9a9aab',
        dim2: '#6b6b7c',
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
