/**
 * Cifrado de campos sensibles (EIN, cuentas LA/LWC) — AES-256-GCM.
 * La llave vive solo en Vercel: FIELD_ENCRYPTION_KEY = 32 bytes en base64
 *   generar con:  openssl rand -base64 32
 * Formato guardado: "v1.<iv b64>.<tag b64>.<data b64>"
 * Solo usar del lado del servidor (nunca importar desde un Client Component).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY no configurada');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY debe ser de 32 bytes (base64)');
  return k;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptField(stored: string): string {
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Formato cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

/** Devuelve { enc, last4 } listo para guardar; solo dígitos cuentan para last4. */
export function protectId(value: string): { enc: string; last4: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) throw new Error('Identificador demasiado corto');
  return { enc: encryptField(value.trim()), last4: digits.slice(-4) };
}

export const maskLast4 = (last4?: string | null) => (last4 ? `•••••${last4}` : '—');
