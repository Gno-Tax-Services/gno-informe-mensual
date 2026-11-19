import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';

export const runtime = 'nodejs';
const ROLES = ['owner', 'officer', 'employee', 'contractor', 'spouse', 'dependent', 'otro'];

/** Personas de un cliente, con sus identificadores enmascarados. ?client_id= */
export async function GET(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'viewer')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get('client_id');
  if (!clientId) return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from('personas')
    .select('id, nombre, rol, activo, notas, identificadores(id, tipo, last4, activo)')
    .eq('client_id', clientId)
    .order('nombre');
  if (error) return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'staff')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.client_id || !b.nombre?.trim() || !ROLES.includes(b.rol)) {
    return NextResponse.json({ error: 'client_id, nombre y rol son requeridos' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('personas')
    .insert({ client_id: b.client_id, nombre: b.nombre.trim(), rol: b.rol, notas: b.notas || null, updated_by: staff.email })
    .select('id, nombre, rol')
    .single();
  if (error) {
    const dlp = error.code === '23514';
    return NextResponse.json({ error: dlp ? 'No escriba SSN/ITIN/EIN en nombre o notas' : 'No se pudo guardar' }, { status: dlp ? 400 : 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
