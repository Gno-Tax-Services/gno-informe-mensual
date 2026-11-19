import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { registrarEntrega, validarEntrega, type NuevaEntrega } from '@/lib/compliance/entregas';

export const runtime = 'nodejs';

/** Lista entregas. Filtros: client_id, modulo, desde, hasta (ISO), incluir_anuladas=1. */
export async function GET(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'viewer')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = new URL(req.url).searchParams;
  let q = supabaseAdmin()
    .from('entregas')
    .select('*, clients(nombre_compania), entrega_documentos(compliance_documents(id, nombre, drive_url))')
    .order('entregado_en', { ascending: false })
    .limit(Math.min(Number(p.get('limit')) || 200, 1000));
  if (p.get('client_id')) q = q.eq('client_id', p.get('client_id')!);
  if (p.get('modulo')) q = q.eq('modulo', p.get('modulo')!);
  if (p.get('desde')) q = q.gte('entregado_en', p.get('desde')!);
  if (p.get('hasta')) q = q.lte('entregado_en', p.get('hasta')!);
  if (p.get('incluir_anuladas') !== '1') q = q.is('anulada_en', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Registra una entrega. */
export async function POST(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'staff')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<NuevaEntrega>;
  const err = validarEntrega(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    const entrega = await registrarEntrega(body as NuevaEntrega, staff.email);
    return NextResponse.json(entrega, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
