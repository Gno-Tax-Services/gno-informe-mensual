import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { isDemoMode } from '@/lib/demo';
import { loadEntity, ownerRowFor } from '@/lib/entity/server';
import { draftErrors, validateEntity } from '@/lib/entity/rules';
import { looksLikeFullId } from '@/lib/entity/mask';
import {
  BALANCE_SOURCES, CLASSIFICATIONS, ELECTION_FORMS, HOLDER_TYPES, LEGAL_FORMS, OWNER_ROLES,
  type BalanceInput, type ClassInput, type EntityState, type OwnerInput, type ProfileInput,
} from '@/lib/entity/types';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status: 400 });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Mismo origen: el navegador del staff llama a esta API desde el portal. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}

/** Mensaje seguro: los de nuestros triggers (en español) se muestran; el resto, genérico. */
function dbError(e: { code?: string; message?: string }) {
  const m = e.message ?? '';
  if (e.code === '23514' && !/violates check constraint/.test(m)) return NextResponse.json({ error: m }, { status: 400 });
  if (e.code === '23514') return bad('Dato inválido: revise los campos');
  if (e.code === '23503') return NextResponse.json({ error: 'No se puede quitar: otros registros dependen de este dato' }, { status: 409 });
  if (e.code === '23505') return NextResponse.json({ error: 'Registro duplicado' }, { status: 409 });
  return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
}

/** Estado del asistente: personas del cliente, clasificación, dueños y saldos. ?client_id= */
export async function GET(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'viewer')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get('client_id') || '';
  if (!UUID.test(clientId)) return bad('client_id inválido');
  try {
    return NextResponse.json(await loadEntity(clientId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  }
}

/**
 * Guarda un paso completo (atómico) o confirma el alta.
 * body: { client_id, step: 'profile'|'classifications'|'owners'|'balances'|'complete', ... }
 */
export async function POST(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'staff')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Modo demo: no se guarda nada' }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad('Cuerpo inválido');
  const clientId = str(b.client_id);
  if (!UUID.test(clientId)) return bad('client_id inválido');

  const db = supabaseAdmin();
  const { data: cl } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!cl) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  let current;
  try { current = await loadEntity(clientId); } catch { return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 }); }
  const actor = staff.email;

  /** Valida el estado que resultaría de guardar; solo bloquean los errores de formato (borrador). */
  const check = (state: EntityState, step: 1 | 2 | 3 | 4) => {
    const errs = draftErrors(validateEntity(state), step);
    return errs.length ? bad('Revise los datos', { issues: errs }) : null;
  };

  switch (b.step) {
    case 'profile': {
      const p = b.profile ?? {};
      const profile: ProfileInput = {
        legal_form: LEGAL_FORMS.includes(p.legal_form) ? p.legal_form : '',
        state_of_formation: str(p.state_of_formation).toUpperCase(),
        formation_date: str(p.formation_date),
        fiscal_year_end: str(p.fiscal_year_end),
        ein_last4: str(p.ein_last4),
      };
      if (!profile.legal_form) return bad('Forma legal requerida');
      const blocked = check({ ...current.state, profile }, 1);
      if (blocked) return blocked;
      const { error } = await db.from('entity_profile').upsert({
        client_id: clientId, legal_form: profile.legal_form, state_of_formation: profile.state_of_formation,
        formation_date: profile.formation_date || null, fiscal_year_end: profile.fiscal_year_end,
        ein_last4: profile.ein_last4 || null, updated_by: actor,
      }, { onConflict: 'client_id' });
      if (error) return dbError(error);
      break;
    }

    case 'classifications': {
      if (!current.hasProfile) return bad('Primero guarde la estructura (paso 1)');
      const rows = Array.isArray(b.rows) ? b.rows : null;
      if (!rows) return bad('rows requerido');
      const classifications: ClassInput[] = rows.map((r: any, i: number) => ({
        key: String(i), id: UUID.test(str(r.id)) ? r.id : undefined,
        classification: CLASSIFICATIONS.includes(r.classification) ? r.classification : '',
        effective_date: str(r.effective_date),
        election_form: ELECTION_FORMS.includes(r.election_form) ? r.election_form : 'none',
        election_doc: str(r.election_doc).trim(),
      }));
      const blocked = check({ ...current.state, classifications }, 2);
      if (blocked) return blocked;
      const { error } = await db.rpc('entity_save_classifications', {
        p_client_id: clientId, p_actor: actor,
        p_rows: classifications.map((c) => ({ id: c.id ?? null, classification: c.classification, effective_date: c.effective_date, election_form: c.election_form, election_doc: c.election_doc || null })),
      });
      if (error) return dbError(error);
      break;
    }

    case 'owners': {
      if (!current.hasProfile) return bad('Primero guarde la estructura (paso 1)');
      const rows = Array.isArray(b.rows) ? b.rows : null;
      if (!rows) return bad('rows requerido');
      const owners: OwnerInput[] = rows.map((r: any, i: number) => ({
        key: String(i), id: UUID.test(str(r.id)) ? r.id : undefined,
        persona_key: str(r.persona_id) || `new:${str(r.nombre).trim().toLowerCase()}`,
        persona_id: UUID.test(str(r.persona_id)) ? r.persona_id : undefined,
        nombre: str(r.nombre).trim(),
        role: OWNER_ROLES.includes(r.role) ? r.role : 'owner',
        holder_type: HOLDER_TYPES.includes(r.holder_type) ? r.holder_type : 'individual',
        ownership_pct: str(r.ownership_pct), start_date: str(r.start_date), end_date: str(r.end_date),
        is_officer: r.is_officer === true,
      }));
      const blocked = check({ ...current.state, owners }, 3);
      if (blocked) return blocked;

      // Resuelve personas: solo del MISMO cliente; si no existe, se crea (sin identificadores).
      const known = new Map(current.personas.map((p) => [p.id, p]));
      const byName = new Map(current.personas.map((p) => [p.nombre.trim().toLowerCase(), p.id]));
      const resolved: Record<string, unknown>[] = [];
      for (const o of owners) {
        let id = o.persona_id && known.has(o.persona_id) ? o.persona_id : byName.get(o.nombre.toLowerCase());
        if (!id) {
          if (looksLikeFullId(o.nombre)) return bad('No escriba números de identificación en el nombre');
          const { data, error } = await db.from('personas').insert({ client_id: clientId, nombre: o.nombre, rol: 'owner', updated_by: actor }).select('id').single();
          if (error || !data) return dbError(error ?? {});
          id = data.id as string;
          byName.set(o.nombre.toLowerCase(), id);
        }
        resolved.push({
          id: o.id ?? null, persona_id: id, role: o.role, holder_type: o.holder_type, ownership_pct: o.ownership_pct,
          start_date: o.start_date, end_date: o.end_date || null, is_officer: o.is_officer,
        });
      }
      const { error } = await db.rpc('entity_save_owners', { p_client_id: clientId, p_rows: resolved, p_actor: actor });
      if (error) return dbError(error);
      break;
    }

    case 'balances': {
      if (!current.hasProfile) return bad('Primero guarde la estructura (paso 1)');
      const rows = Array.isArray(b.rows) ? b.rows : null;
      const asOf = str(b.as_of);
      if (!rows) return bad('rows requerido');
      const balances: BalanceInput[] = rows.map((r: any, i: number) => ({
        key: String(i), account_code: str(r.account_code), account_name: str(r.account_name).trim(),
        persona_key: UUID.test(str(r.persona_id)) ? r.persona_id : null, amount: str(r.amount),
        source: BALANCE_SOURCES.includes(r.source) ? r.source : 'GNO',
      }));
      const blocked = check({ ...current.state, as_of: asOf, balances }, 4);
      if (blocked) return blocked;
      const payload: Record<string, unknown>[] = [];
      for (const r of balances) {
        let ownerId: string | null = null;
        if (r.persona_key) {
          const row = ownerRowFor(current.state.owners, r.persona_key, asOf);
          if (!row?.id) return bad('El dueño elegido no está guardado: guarde el paso 3 primero');
          ownerId = row.id;
        }
        payload.push({ account_code: r.account_code, account_name: r.account_name || null, owner_id: ownerId, amount: r.amount, source: r.source });
      }
      const { error } = await db.rpc('entity_save_opening_balances', { p_client_id: clientId, p_as_of: asOf, p_rows: payload, p_actor: actor });
      if (error) return dbError(error);
      break;
    }

    case 'complete': {
      // Valida pasos 1-4 y crea las cuentas de Equity en una sola transacción (función SQL)
      const { error } = await db.rpc('entity_complete_setup', { p_client_id: clientId, p_actor: actor });
      if (error) return dbError(error);
      break;
    }

    default:
      return bad('step inválido');
  }

  try {
    return NextResponse.json({ ok: true, bundle: await loadEntity(clientId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
