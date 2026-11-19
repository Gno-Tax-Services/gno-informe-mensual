import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { TIPOS, enmascarar, proteger, type TipoId } from '@/lib/compliance/identificadores';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Guarda un SSN/ITIN/ATIN (de una persona) o un EIN (del negocio).
 * El número viaja una sola vez del navegador al servidor, se cifra aquí y la
 * respuesta solo trae los últimos 4. Nunca se devuelve ni se registra en claro.
 * Body: { client_id, persona_id?, tipo, valor }
 */
export async function POST(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'staff')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const b = await req.json().catch(() => ({}));
  const tipo = b.tipo as TipoId;
  if (!b.client_id || !TIPOS.includes(tipo) || typeof b.valor !== 'string') {
    return NextResponse.json({ error: 'client_id, tipo y valor son requeridos' }, { status: 400, headers: NO_STORE });
  }
  if ((tipo === 'EIN') !== !b.persona_id) {
    return NextResponse.json({ error: tipo === 'EIN' ? 'El EIN es del negocio (sin persona)' : 'SSN/ITIN requieren persona_id' }, { status: 400, headers: NO_STORE });
  }
  let fila;
  try {
    fila = proteger(tipo, b.valor);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400, headers: NO_STORE });
  }
  const db = supabaseAdmin();
  const { data: dup } = await db
    .from('identificadores')
    .select('id, client_id, clients(nombre_compania)')
    .eq('tipo', tipo)
    .eq('huella', fila.huella)
    .eq('activo', true)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      { error: `Ese ${tipo} ya está registrado (${enmascarar(tipo, fila.last4)}) en ${(dup as any).clients?.nombre_compania ?? 'otro cliente'}` },
      { status: 409, headers: NO_STORE },
    );
  }
  const { data, error } = await db
    .from('identificadores')
    .insert({ client_id: b.client_id, persona_id: b.persona_id || null, ...fila, updated_by: staff.email })
    .select('id, tipo, last4')
    .single();
  // Mensaje genérico: nunca reenviar el detalle de Postgres (podría traer datos de la fila)
  if (error) return NextResponse.json({ error: 'No se pudo guardar el identificador' }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ...data, mascara: enmascarar(tipo, data.last4) }, { status: 201, headers: NO_STORE });
}

/** Desactiva un identificador (no se borra). Solo admin. Body: { id } */
export async function DELETE(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'admin')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400, headers: NO_STORE });
  const { error } = await supabaseAdmin().from('identificadores').update({ activo: false, updated_by: staff.email }).eq('id', id);
  if (error) return NextResponse.json({ error: 'No se pudo desactivar' }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
