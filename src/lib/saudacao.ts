// Saudação e textos da barra do topo.
import type { PresetPeriodo } from '@/lib/periodo';

/** Bom dia / Boa tarde / Boa noite, no horário de Brasília. */
export function saudacao(agora: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora),
  );
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "Aqui está o resumo da sua operação ___." */
export function resumoDoPeriodo(preset: PresetPeriodo): string {
  switch (preset) {
    case 'hoje':
      return 'hoje';
    case 'ontem':
      return 'de ontem';
    case '7d':
      return 'dos últimos 7 dias';
    case '30d':
      return 'dos últimos 30 dias';
    case 'mes_atual':
      return 'deste mês';
    case 'mes_passado':
      return 'do mês passado';
    default:
      return 'no período escolhido';
  }
}

/** "agora", "há 3 min", "há 2 h". */
export function haQuanto(desde: number, agora: number = Date.now()): string {
  const min = Math.floor((agora - desde) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}
