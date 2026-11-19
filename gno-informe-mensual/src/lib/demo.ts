import { timingSafeEqual } from 'crypto';

/**
 * Modo DEMO: se activa con GNO_DEMO_MODE=1 en un deploy de Vercel APARTE,
 * conectado a un proyecto Supabase APARTE con datos ficticios.
 * Tres candados para que nunca se active en producción:
 *  1. La variable GNO_DEMO_MODE=1.
 *  2. Contraseña DEMO_PASSWORD de al menos 12 caracteres.
 *  3. La base debe tener la tabla demo_instance con su fila (solo la crea
 *     supabase/seed/demo.sql). Producción no la tiene → el login falla.
 */
export const isDemoMode = () => process.env.GNO_DEMO_MODE === '1';
export const DEMO_EMAIL = 'demo@demo.gno';

export function demoCredentialsOk(user: string, pass: string): boolean {
  const expectedUser = (process.env.DEMO_USER || 'demo').toLowerCase();
  const expectedPass = process.env.DEMO_PASSWORD || '';
  if (expectedPass.length < 12) return false;
  const a = Buffer.from(`${user.trim().toLowerCase()}\n${pass}`);
  const b = Buffer.from(`${expectedUser}\n${expectedPass}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isDemoDatabase(): Promise<boolean> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin().from('demo_instance').select('id').maybeSingle();
  return !error && !!data;
}
