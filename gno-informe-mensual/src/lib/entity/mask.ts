/**
 * Máscara de identificadores: SOLO los últimos 4. Sin imports de servidor (se usa en componentes de cliente).
 * El valor completo nunca llega a estas pantallas: se administra cifrado en Personas e identificadores.
 */
export type IdTipo = 'SSN' | 'ITIN' | 'ATIN' | 'EIN';

export function maskId(tipo: string, last4?: string | null): string {
  if (!last4 || !/^\d{4}$/.test(last4)) return '—';
  return tipo === 'EIN' ? `••-•••${last4}` : `•••-••-${last4}`;
}

/** Última defensa antes de mostrar o enviar algo parecido a un SSN/ITIN/EIN completo. */
export const looksLikeFullId = (s: string): boolean =>
  /(^|[^0-9])[0-9]{3}[- .][0-9]{2}[- .][0-9]{4}([^0-9]|$)/.test(s) ||
  /(^|[^0-9])[0-9]{2}-[0-9]{7}([^0-9]|$)/.test(s) ||
  /(^|[^0-9])[0-9]{9}([^0-9]|$)/.test(s);
