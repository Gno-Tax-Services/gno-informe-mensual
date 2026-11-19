import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { decryptField } from '@/lib/field-crypto';
import { formatear, type TipoId } from '@/lib/compliance/identificadores';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
const LIMITE_POR_HORA = 10;

/**
 * Muestra el número completo. Solo admin, con motivo (≥ 10 caracteres),
 * máximo 10 por hora por usuario. Cada consulta queda en change_log
 * (VIEW_SENSITIVE) con quién, cuándo, cuál y por qué — sin el número.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await currentStaff();
  if (!puede(staff, 'admin')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const { motivo } = await req.json().catch(() => ({ motivo: '' }));
  if (typeof motivo !== 'string' || motivo.trim().length < 10) {
    return NextResponse.json({ error: 'Escriba el motivo (mínimo 10 caracteres)' }, { status: 400, headers: NO_STORE });
  }
  if (/[0-9]{3}[- .]?[0-9]{2}[- .]?[0-9]{4}|[0-9]{2}-[0-9]{7}/.test(motivo)) {
    return NextResponse.json({ error: 'No escriba números de identificación en el motivo' }, { status: 400, headers: NO_STORE });
  }
  const db = supabaseAdmin();
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from('change_log')
    .select('id', { count: 'exact', head: true })
    .eq('operacion', 'VIEW_SENSITIVE')
    .eq('actor', staff.email)
    .gte('at', haceUnaHora);
  if ((count ?? 0) >= LIMITE_POR_HORA) {
    return NextResponse.json({ error: 'Límite de consultas por hora alcanzado' }, { status: 429, headers: NO_STORE });
  }
  const { data: fila } = await db
    .from('identificadores')
    .select('id, tipo, valor_enc, last4, client_id, persona_id, activo')
    .eq('id', params.id)
    .maybeSingle();
  if (!fila || !fila.activo) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: NO_STORE });

  // Primero se registra; si la bitácora falla, no se muestra el número.
  const { error: logErr } = await db.from('change_log').insert({
    actor: staff.email,
    tabla: 'identificadores',
    fila_id: fila.id,
    operacion: 'VIEW_SENSITIVE',
    cambios: { tipo: fila.tipo, last4: fila.last4, client_id: fila.client_id, persona_id: fila.persona_id, motivo: motivo.trim() },
  });
  if (logErr) return NextResponse.json({ error: 'No se pudo registrar la consulta' }, { status: 500, headers: NO_STORE });

  let valor: string;
  try {
    valor = formatear(fila.tipo as TipoId, decryptField(fila.valor_enc));
  } catch {
    return NextResponse.json({ error: 'No se pudo descifrar' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ tipo: fila.tipo, valor, expira_en_segundos: 30 }, { headers: NO_STORE });
}
