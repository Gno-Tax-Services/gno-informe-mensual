/** Dinero en centavos enteros: nunca se suman decimales flotantes. */

/** "20,475.38" | "20475.38" | 20475.38 → 2047538. Devuelve null si no es un monto válido. */
export function toCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [i, d = ''] = s.replace('-', '').split('.');
  const cents = Number(i) * 100 + Number(d.padEnd(2, '0'));
  return neg ? -cents : cents;
}

export const fromCents = (c: number): number => c / 100;

export function fmtUSD(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Reparte `total` (centavos) según `weights` con el método del resto mayor:
 * la suma de las partes es EXACTAMENTE `total`. Empates: gana el primero de la lista.
 * Funciona con totales negativos (se reparte el valor absoluto y se devuelve el signo).
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total)) throw new Error('allocate: total debe ser entero (centavos)');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (!(sum > 0) || weights.some((w) => w < 0)) return weights.map(() => 0);
  const abs = Math.abs(total);
  const sign = total < 0 ? -1 : 1;
  const exact = weights.map((w) => (abs * w) / sum);
  const base = exact.map(Math.floor);
  let rest = abs - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    base[i] += 1;
    rest -= 1;
  }
  return base.map((b) => sign * b);
}
