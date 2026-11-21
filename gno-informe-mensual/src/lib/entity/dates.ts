/** Fechas ISO 'YYYY-MM-DD' en UTC (sin husos horarios ni horario de verano). */
export const isDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const toUTC = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

export const addDays = (s: string, n: number): string => fromUTC(toUTC(s) + n * DAY);
export const maxDate = (a: string, b: string) => (a >= b ? a : b);
export const minDate = (a: string, b: string) => (a <= b ? a : b);

/** Días entre dos fechas, ambas inclusivas. 0 si el rango está invertido. */
export const daysInclusive = (from: string, to: string): number =>
  from > to ? 0 : Math.round((toUTC(to) - toUTC(from)) / DAY) + 1;

/**
 * Ejercicio fiscal que TERMINA en `year` según el cierre MM-DD.
 * Con 12-31 es el año calendario. Un 02-29 en año no bisiesto cae el 28.
 */
export function fiscalYearWindow(year: number, fiscalYearEnd: string): { start: string; end: string } {
  const [mm, dd] = fiscalYearEnd.split('-').map(Number);
  const clamp = (y: number) => {
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return `${y}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
  };
  return { start: addDays(clamp(year - 1), 1), end: clamp(year) };
}
