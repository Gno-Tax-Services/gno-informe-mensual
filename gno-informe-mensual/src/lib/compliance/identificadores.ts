import { blindIndex, encryptField, currentKeyVersion } from '@/lib/field-crypto';

export const TIPOS = ['SSN', 'ITIN', 'ATIN', 'EIN'] as const;
export type TipoId = (typeof TIPOS)[number];

const soloDigitos = (v: string) => v.replace(/\D/g, '');

/** Reglas de la SSA: área ≠ 000/666/9xx, grupo ≠ 00, serie ≠ 0000. */
export function validarSSN(v: string): string | null {
  const d = soloDigitos(v);
  if (d.length !== 9) return 'El SSN debe tener 9 dígitos';
  const area = d.slice(0, 3), grupo = d.slice(3, 5), serie = d.slice(5);
  if (area === '000' || area === '666' || area.startsWith('9')) return 'SSN inválido (área)';
  if (grupo === '00') return 'SSN inválido (grupo)';
  if (serie === '0000') return 'SSN inválido (serie)';
  return null;
}

/** ITIN del IRS: empieza en 9; dígitos 4-5 en 50–65, 70–88, 90–92 o 94–99. */
export function validarITIN(v: string): string | null {
  const d = soloDigitos(v);
  if (d.length !== 9) return 'El ITIN debe tener 9 dígitos';
  if (!d.startsWith('9')) return 'El ITIN empieza con 9';
  const m = Number(d.slice(3, 5));
  const ok = (m >= 50 && m <= 65) || (m >= 70 && m <= 88) || (m >= 90 && m <= 92) || (m >= 94 && m <= 99);
  return ok ? null : 'ITIN inválido (dígitos 4-5)';
}

/** ATIN (adopción): empieza en 9, dígitos 4-5 = 93. */
export function validarATIN(v: string): string | null {
  const d = soloDigitos(v);
  if (d.length !== 9 || !d.startsWith('9') || d.slice(3, 5) !== '93') return 'ATIN inválido';
  return null;
}

/** EIN: 9 dígitos; prefijos 00, 07-09, 17-19, 28-29, 49, 69-70, 78-79, 89 y 96-97 no se asignan. */
export function validarEIN(v: string): string | null {
  const d = soloDigitos(v);
  if (d.length !== 9) return 'El EIN debe tener 9 dígitos';
  const p = Number(d.slice(0, 2));
  if ([0, 7, 8, 9, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, 89, 96, 97].includes(p)) return 'EIN inválido (prefijo)';
  return null;
}

export function validar(tipo: TipoId, valor: string): string | null {
  switch (tipo) {
    case 'SSN': return validarSSN(valor);
    case 'ITIN': return validarITIN(valor);
    case 'ATIN': return validarATIN(valor);
    case 'EIN': return validarEIN(valor);
    default: return 'Tipo inválido';
  }
}

/** Máscara estándar: solo últimos 4. */
export function enmascarar(tipo: TipoId, last4?: string | null): string {
  if (!last4) return '—';
  return tipo === 'EIN' ? `••-•••${last4}` : `•••-••-${last4}`;
}

/** Formato completo (solo para la respuesta de "revelar"). */
export function formatear(tipo: TipoId, digits: string): string {
  return tipo === 'EIN' ? `${digits.slice(0, 2)}-${digits.slice(2)}` : `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Prepara la fila para guardar: cifrado, últimos 4 y huella. Nunca devuelve el valor en claro. */
export function proteger(tipo: TipoId, valor: string) {
  const err = validar(tipo, valor);
  if (err) throw new Error(err);
  const d = soloDigitos(valor);
  return {
    tipo,
    valor_enc: encryptField(d),
    last4: d.slice(-4),
    huella: blindIndex(tipo, d),
    key_version: currentKeyVersion(),
  };
}
