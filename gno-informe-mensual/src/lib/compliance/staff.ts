import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type Rol = 'admin' | 'staff' | 'viewer';
export interface Staff { email: string; nombre: string; rol: Rol }

const ORDEN: Record<Rol, number> = { viewer: 0, staff: 1, admin: 2 };

/**
 * Devuelve el miembro del equipo de la sesión actual, o null.
 * Requiere sesión NextAuth (allowlist) y fila activa en team_members.
 */
export async function currentStaff(): Promise<Staff | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const { data } = await supabaseAdmin()
    .from('team_members')
    .select('email, nombre, rol, activo')
    .eq('email', email)
    .maybeSingle();
  if (!data || !data.activo) return null;
  return { email: data.email, nombre: data.nombre, rol: data.rol as Rol };
}

export function puede(staff: Staff | null, minimo: Rol): staff is Staff {
  return !!staff && ORDEN[staff.rol] >= ORDEN[minimo];
}
