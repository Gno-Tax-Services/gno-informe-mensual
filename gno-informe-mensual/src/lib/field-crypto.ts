/**
 * Cifrado de campos sensibles (SSN, ITIN, EIN, cuentas LA/LWC) — AES-256-GCM.
 * Solo usar del lado del servidor (nunca importar desde un Client Component).
 *
 * Llaves (Vercel, 32 bytes en base64 — `openssl rand -base64 32`):
 *   FIELD_ENCRYPTION_KEY      → versión v1
 *   FIELD_ENCRYPTION_KEY_V2   → versión v2 (opcional, para rotar)
 *   FIELD_HMAC_KEY            → huella (blind index) para detectar duplicados
 *                               sin descifrar. Debe ser DISTINTA a las de cifrado.
 * Se cifra siempre con la versión más alta disponible; se descifra según el
 * prefijo guardado ("v1." / "v2."), así una rotación no rompe datos viejos.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const KEY_ENV: Record<string, string> = { v1: 'FIELD_ENCRYPTION_KEY', v2: 'FIELD_ENCRYPTION_KEY_V2' };

function keyFor(version: string): Buffer {
  const env = KEY_ENV[version];
  const raw = env ? process.env[env] : undefined;
  if (!raw) throw new Error(`Llave de cifrado ${version} no configurada`);
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error(`${env} debe ser de 32 bytes (base64)`);
  return k;
}

export function currentKeyVersion(): string {
  return process.env.FIELD_ENCRYPTION_KEY_V2 ? 'v2' : 'v1';
}

export function encryptField(plain: string): string {
  const v = currentKeyVersion();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFor(v), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [v, iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptField(stored: string): string {
  const [v, iv, tag, data] = stored.split('.');
  if (!KEY_ENV[v] || !iv || !tag || !data) throw new Error('Formato cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', keyFor(v), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

/** ¿Este valor cifrado usa una llave vieja? (para re-cifrar al rotar) */
export const needsReencrypt = (stored: string) => !stored.startsWith(`${currentKeyVersion()}.`);

/** Huella HMAC-SHA256 (hex) de un valor normalizado; no es reversible. */
export function blindIndex(tipo: string, digits: string): string {
  const raw = process.env.FIELD_HMAC_KEY;
  if (!raw) throw new Error('FIELD_HMAC_KEY no configurada');
  const k = Buffer.from(raw, 'base64');
  if (k.length < 32) throw new Error('FIELD_HMAC_KEY debe ser de al menos 32 bytes (base64)');
  return createHmac('sha256', k).update(`${tipo}:${digits}`).digest('hex');
}

/** Devuelve { enc, last4 } listo para guardar; solo dígitos cuentan para last4. */
export function protectId(value: string): { enc: string; last4: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) throw new Error('Identificador demasiado corto');
  return { enc: encryptField(digits), last4: digits.slice(-4) };
}

export const maskLast4 = (last4?: string | null) => (last4 ? `•••••${last4}` : '—');

/** Quita cualquier campo *_enc o huella de un objeto antes de mandarlo al navegador. */
export function sanitize<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(sanitize) as any;
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
      if (k.endsWith('_enc') || k === 'huella') continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return obj;
}
