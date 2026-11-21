import { supabaseAdmin } from '@/lib/supabase-admin';
import type { BalanceInput, ClassInput, EntityState, OwnerInput, ProfileInput } from './types';
import type { Classification, ElectionForm, HolderType, LegalForm, OwnerRole, BalanceSource } from './types';

/**
 * Lectura del módulo Entidad y Equity (solo servidor, service_role).
 * Los identificadores se leen SOLO como (tipo, last4): nunca valor_enc ni huella.
 */

export interface PersonaOption { id: string; nombre: string; ids: { tipo: string; last4: string }[] }

export interface StoredAccount {
  id: string; code: string; name_en: string; name_es: string; role: string;
  persona_id: string | null; template: Classification; opened_on: string; closed_on: string | null;
}

export interface EntityBundle {
  state: EntityState;
  personas: PersonaOption[];
  accounts: StoredAccount[];
  completedAt: string | null;
  hasProfile: boolean;
}

export const EMPTY_PROFILE: ProfileInput = {
  legal_form: '', state_of_formation: 'LA', formation_date: '', fiscal_year_end: '12-31', ein_last4: '',
};

const num = (v: unknown) => (v === null || v === undefined ? '' : String(Number(v)));

export async function loadEntity(clientId: string): Promise<EntityBundle> {
  const db = supabaseAdmin();
  const [prof, cls, own, bal, acc, per] = await Promise.all([
    db.from('entity_profile').select('legal_form, state_of_formation, formation_date, fiscal_year_end, ein_last4, setup_completed_at').eq('client_id', clientId).maybeSingle(),
    db.from('tax_classification').select('id, classification, effective_date, election_form, election_doc').eq('client_id', clientId).order('effective_date'),
    db.from('owners').select('id, persona_id, role, holder_type, ownership_pct, start_date, end_date, is_officer, personas(nombre)').eq('client_id', clientId).order('seq'),
    db.from('opening_balances').select('id, as_of, account_code, account_name, owner_id, amount, source').eq('client_id', clientId).order('account_code'),
    db.from('chart_accounts').select('id, code, name_en, name_es, role, persona_id, template, opened_on, closed_on').eq('client_id', clientId).order('opened_on').order('code'),
    db.from('personas').select('id, nombre, identificadores(tipo, last4, activo)').eq('client_id', clientId).order('nombre'),
  ]);
  for (const r of [prof, cls, own, bal, acc, per]) if (r.error) throw new Error(r.error.message);

  const p = prof.data;
  const profile: ProfileInput = p
    ? {
        legal_form: p.legal_form as LegalForm,
        state_of_formation: p.state_of_formation,
        formation_date: p.formation_date ?? '',
        fiscal_year_end: p.fiscal_year_end,
        ein_last4: p.ein_last4 ?? '',
      }
    : { ...EMPTY_PROFILE };

  const classifications: ClassInput[] = (cls.data ?? []).map((c: any) => ({
    key: c.id, id: c.id, classification: c.classification as Classification, effective_date: c.effective_date,
    election_form: c.election_form as ElectionForm, election_doc: c.election_doc ?? '',
  }));

  const ownerRows = (own.data ?? []) as any[];
  const owners: OwnerInput[] = ownerRows.map((o) => ({
    key: o.id, id: o.id, persona_key: o.persona_id, persona_id: o.persona_id,
    nombre: (Array.isArray(o.personas) ? o.personas[0]?.nombre : o.personas?.nombre) ?? '',
    role: o.role as OwnerRole, holder_type: o.holder_type as HolderType, ownership_pct: num(o.ownership_pct),
    start_date: o.start_date, end_date: o.end_date ?? '', is_officer: !!o.is_officer,
  }));
  const personaOfOwner = new Map(ownerRows.map((o) => [o.id, o.persona_id as string]));

  const balRows = (bal.data ?? []) as any[];
  const balances: BalanceInput[] = balRows.map((b) => ({
    key: b.id, account_code: b.account_code, account_name: b.account_name ?? '',
    persona_key: b.owner_id ? personaOfOwner.get(b.owner_id) ?? null : null,
    amount: Number(b.amount).toFixed(2), source: b.source as BalanceSource,
  }));

  const personas: PersonaOption[] = ((per.data ?? []) as any[]).map((x) => ({
    id: x.id,
    nombre: x.nombre,
    // Solo tipo + últimos 4 de identificadores activos de personas físicas (nunca el valor)
    ids: ((x.identificadores ?? []) as any[])
      .filter((i) => i.activo && i.tipo !== 'EIN' && /^\d{4}$/.test(i.last4))
      .map((i) => ({ tipo: i.tipo as string, last4: i.last4 as string })),
  }));

  return {
    state: { profile, classifications, owners, as_of: balRows[0]?.as_of ?? '', balances },
    personas,
    accounts: (acc.data ?? []) as StoredAccount[],
    completedAt: p?.setup_completed_at ?? null,
    hasProfile: !!p,
  };
}

/** Fila de owners que corresponde a una persona en una fecha (la vigente, o la primera). */
export function ownerRowFor(owners: OwnerInput[], personaId: string, asOf: string): OwnerInput | null {
  const rows = owners.filter((o) => o.persona_id === personaId && o.id);
  const active = rows.find((o) => o.start_date <= asOf && (!o.end_date || o.end_date >= asOf));
  return active ?? [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
}
