import type { BalanceInput, ClassInput, Classification, EntityState, Issue, LegalForm, OwnerInput } from './types';
import { toCents } from './money';
import { addDays, isDate } from './dates';
import { looksLikeFullId } from './mask';

/* ───────── Combinaciones forma legal × clasificación (spec) ───────── */

export const ALLOWED_CLASSIFICATIONS: Record<LegalForm, readonly Classification[]> = {
  sole_prop: ['disregarded'],
  llc_single: ['disregarded', 's_corp', 'c_corp'],
  llc_multi: ['partnership', 's_corp', 'c_corp'],
  partnership: ['partnership'],
  corporation: ['s_corp', 'c_corp'],
};

export const allowedClassifications = (form: LegalForm | ''): readonly Classification[] =>
  form ? ALLOWED_CLASSIFICATIONS[form] : [];

export const isValidCombo = (form: LegalForm | '', cls: Classification | ''): boolean =>
  !!form && !!cls && ALLOWED_CLASSIFICATIONS[form].includes(cls);

/** Número de dueños exigido por forma legal. */
export const OWNER_LIMITS: Record<LegalForm, { min: number; max: number | null }> = {
  sole_prop: { min: 1, max: 1 },
  llc_single: { min: 1, max: 1 },
  llc_multi: { min: 2, max: null },
  partnership: { min: 2, max: null },
  corporation: { min: 1, max: null },
};

/* ───────── Plantillas de Equity (spec) ───────── */

export type EquityRole =
  | 'owner_capital' | 'partner_capital' | 'contributions' | 'distributions' | 'common_stock' | 'apic'
  | 'retained_earnings' | 'dividends' | 'shareholder_loans' | 'opening_balance_equity';

export interface TemplateLine { code: string; name_en: string; name_es: string; role: EquityRole; per_owner: boolean }

export const EQUITY_TEMPLATES: Record<Classification, readonly TemplateLine[]> = {
  disregarded: [
    { code: '30000', name_en: "Owner's Capital", name_es: 'Capital del dueño', role: 'owner_capital', per_owner: false },
    { code: '30500', name_en: "Owner's Contributions", name_es: 'Aportes del dueño', role: 'contributions', per_owner: false },
    { code: '30700', name_en: "Owner's Draws", name_es: 'Retiros del dueño', role: 'distributions', per_owner: false },
  ],
  partnership: [
    { code: '30100', name_en: 'Partner Capital', name_es: 'Capital del socio', role: 'partner_capital', per_owner: true },
    { code: '30500', name_en: 'Partner Contributions', name_es: 'Aportes del socio', role: 'contributions', per_owner: true },
    { code: '30700', name_en: 'Partner Distributions', name_es: 'Distribuciones al socio', role: 'distributions', per_owner: true },
  ],
  s_corp: [
    { code: '25000', name_en: 'Loans from Shareholders', name_es: 'Préstamos de accionistas', role: 'shareholder_loans', per_owner: true },
    { code: '31000', name_en: 'Common Stock', name_es: 'Acciones comunes', role: 'common_stock', per_owner: false },
    { code: '31500', name_en: 'Additional Paid-in Capital', name_es: 'Capital pagado adicional', role: 'apic', per_owner: false },
    { code: '32000', name_en: 'Retained Earnings / AAA', name_es: 'Utilidades retenidas / AAA', role: 'retained_earnings', per_owner: false },
    { code: '33000', name_en: 'Shareholder Distributions', name_es: 'Distribuciones a accionistas', role: 'distributions', per_owner: true },
  ],
  c_corp: [
    { code: '25000', name_en: 'Loans from Shareholders', name_es: 'Préstamos de accionistas', role: 'shareholder_loans', per_owner: true },
    { code: '31000', name_en: 'Common Stock', name_es: 'Acciones comunes', role: 'common_stock', per_owner: false },
    { code: '31500', name_en: 'Additional Paid-in Capital', name_es: 'Capital pagado adicional', role: 'apic', per_owner: false },
    { code: '32000', name_en: 'Retained Earnings', name_es: 'Utilidades retenidas', role: 'retained_earnings', per_owner: false },
    { code: '34000', name_en: 'Dividends Paid', name_es: 'Dividendos pagados', role: 'dividends', per_owner: true },
  ],
};

/** Rol por código (igual que public.equity_code_role en 0013). */
export function equityCodeRole(code: string): EquityRole | null {
  if (/^25\d{3}$/.test(code)) return 'shareholder_loans';
  if (!/^3\d{4}$/.test(code)) return null;
  const n = Number(code);
  if (n >= 30000 && n <= 30099) return 'owner_capital';
  if (n >= 30100 && n <= 30499) return 'partner_capital';
  if (n >= 30500 && n <= 30699) return 'contributions';
  if (n >= 30700 && n <= 30999) return 'distributions';
  if (n >= 31000 && n <= 31499) return 'common_stock';
  if (n >= 31500 && n <= 31999) return 'apic';
  if (n >= 32000 && n <= 32999) return 'retained_earnings';
  if (n >= 33000 && n <= 33999) return 'distributions';
  if (n >= 34000 && n <= 34999) return 'dividends';
  if (n >= 39000 && n <= 39999) return 'opening_balance_equity';
  return null;
}

export type AccountType = 'asset' | 'liability' | 'equity';
export const accountType = (code: string): AccountType | null =>
  code[0] === '1' ? 'asset' : code[0] === '2' ? 'liability' : code[0] === '3' ? 'equity' : null;

/** Etiqueta de retiros según la plantilla ("Draws" / "Distributions" / "Dividends"). */
export const withdrawalLabel = (cls: Classification): 'draws' | 'distributions' | 'dividends' =>
  cls === 'disregarded' ? 'draws' : cls === 'c_corp' ? 'dividends' : 'distributions';

/* ───────── Clasificación vigente y periodos ───────── */

export interface Period { classification: Classification; from: string; to: string | null; key: string }

export function periodsOf(classes: ClassInput[]): Period[] {
  const rows = classes
    .filter((c) => c.classification && isDate(c.effective_date))
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  return rows.map((c, i) => ({
    classification: c.classification as Classification,
    from: c.effective_date,
    to: i + 1 < rows.length ? addDays(rows[i + 1].effective_date, -1) : null,
    key: c.key,
  }));
}

/** La fila con la effective_date más reciente <= fecha. */
export function classificationOn(classes: ClassInput[], date: string): Classification | null {
  const ps = periodsOf(classes).filter((p) => p.from <= date);
  return ps.length ? ps[ps.length - 1].classification : null;
}

/* ───────── Porcentajes y tramos de participación ───────── */

/** "33.3334" → 333334 (diezmilésimas). null si no es un % válido (0 < p ≤ 100, ≤ 4 decimales). */
export function parsePct(s: string): number | null {
  const t = s.trim().replace(/%$/, '');
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(t)) return null;
  const [i, d = ''] = t.split('.');
  const units = Number(i) * 10_000 + Number(d.padEnd(4, '0'));
  return units > 0 && units <= 1_000_000 ? units : null;
}
export const PCT_100 = 1_000_000;

export interface ValidOwner { row: OwnerInput; pct: number; start: string; end: string | null }

export function validOwners(owners: OwnerInput[]): ValidOwner[] {
  const out: ValidOwner[] = [];
  for (const row of owners) {
    const pct = parsePct(row.ownership_pct);
    if (pct === null || !isDate(row.start_date)) continue;
    if (row.end_date && (!isDate(row.end_date) || row.end_date < row.start_date)) continue;
    out.push({ row, pct, start: row.start_date, end: row.end_date || null });
  }
  return out;
}

export interface Segment { from: string; totalPct: number; ownerCount: number }

/** Igual que public.entity_owner_segments: un tramo en cada fecha de cambio. */
export function ownerSegments(owners: OwnerInput[]): Segment[] {
  const vs = validOwners(owners);
  if (!vs.length) return [];
  const bps = new Set<string>();
  for (const o of vs) { bps.add(o.start); if (o.end) bps.add(addDays(o.end, 1)); }
  const mx = vs.some((o) => !o.end) ? null : vs.reduce((m, o) => (o.end! > m ? o.end! : m), '');
  return Array.from(bps)
    .filter((d) => mx === null || d <= mx)
    .sort()
    .map((d) => {
      const act = vs.filter((o) => o.start <= d && (!o.end || o.end >= d));
      return { from: d, totalPct: act.reduce((s, o) => s + o.pct, 0), ownerCount: act.length };
    });
}

/* ───────── Cuadre de saldos iniciales ───────── */

export interface BalanceCheck { assets: number; liabilities: number; equity: number; diff: number; balanced: boolean }

/** activos − pasivos − capital = 0. El tipo sale del primer dígito del código. */
export function balanceCheck(rows: BalanceInput[]): BalanceCheck {
  let assets = 0, liabilities = 0, equity = 0;
  for (const r of rows) {
    const c = toCents(r.amount);
    if (c === null) continue;
    const t = accountType(r.account_code);
    if (t === 'asset') assets += c; else if (t === 'liability') liabilities += c; else if (t === 'equity') equity += c;
  }
  const diff = assets - liabilities - equity;
  return { assets, liabilities, equity, diff, balanced: diff === 0 };
}

/* ───────── Validación completa (pasos 1 a 4) ───────── */

const FYE = /^((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|02-(0[1-9]|1[0-9]|2[0-9]))$/;

const roleRequiresOwner = (cls: Classification, role: EquityRole): boolean => {
  const perOwner = EQUITY_TEMPLATES[cls].some((l) => l.role === role && l.per_owner);
  return perOwner || ((cls === 'partnership' || cls === 's_corp') && (role === 'partner_capital' || role === 'common_stock' || role === 'apic'));
};

/**
 * Valida el estado completo del asistente con las mismas reglas que public.entity_validate (0013),
 * más los controles de formato de cada campo. Los errores bloquean; los avisos solo informan.
 */
export function validateEntity(state: EntityState): Issue[] {
  const out: Issue[] = [];
  const err = (step: Issue['step'], code: Issue['code'], detail?: Issue['detail'], ref?: string) =>
    out.push({ step, severity: 'error', code, detail, ref });
  const warn = (step: Issue['step'], code: Issue['code'], detail?: Issue['detail'], ref?: string) =>
    out.push({ step, severity: 'warn', code, detail, ref });

  /* Paso 1 */
  const p = state.profile;
  if (!p.legal_form) err(1, 'FIELD_REQUIRED', { field: 'legal_form' }, 'legal_form');
  if (!/^[A-Z]{2}$/.test(p.state_of_formation)) err(1, 'FIELD_REQUIRED', { field: 'state_of_formation' }, 'state_of_formation');
  if (p.formation_date && !isDate(p.formation_date)) err(1, 'FIELD_REQUIRED', { field: 'formation_date' }, 'formation_date');
  if (!FYE.test(p.fiscal_year_end)) err(1, 'FIELD_REQUIRED', { field: 'fiscal_year_end' }, 'fiscal_year_end');
  if (p.ein_last4 && !/^\d{4}$/.test(p.ein_last4)) err(1, 'EIN_LAST4_FORMAT', undefined, 'ein_last4');
  if (!p.legal_form) return out; // igual que el SQL: sin estructura no se evalúa lo demás
  const form = p.legal_form;

  /* Paso 2 */
  if (state.classifications.length === 0) err(2, 'CLASS_MISSING');
  const seen = new Set<string>();
  for (const c of state.classifications) {
    if (!c.classification) err(2, 'FIELD_REQUIRED', { field: 'classification' }, c.key);
    if (!isDate(c.effective_date)) err(2, 'FIELD_REQUIRED', { field: 'effective_date' }, c.key);
    else if (seen.has(c.effective_date)) err(2, 'DUPLICATE_ROW', { field: 'effective_date', value: c.effective_date }, c.key);
    else seen.add(c.effective_date);
    if (c.classification && !isValidCombo(form, c.classification)) {
      err(2, 'CLASS_INVALID_COMBO', { classification: c.classification, legal_form: form, effective_date: c.effective_date }, c.key);
    }
    if (looksLikeFullId(c.election_doc)) err(2, 'ID_IN_TEXT', { field: 'election_doc' }, c.key);
    if (c.classification && c.election_form !== 'none' && !c.election_doc.trim()) {
      warn(2, 'ELECTION_DOC_MISSING', { effective_date: c.effective_date, election_form: c.election_form }, c.key);
    }
  }

  /* Paso 3 */
  if (state.owners.length === 0) err(3, 'OWNERS_MISSING');
  for (const o of state.owners) {
    if (!o.nombre.trim()) err(3, 'FIELD_REQUIRED', { field: 'nombre' }, o.key);
    if (looksLikeFullId(o.nombre)) err(3, 'ID_IN_TEXT', { field: 'nombre' }, o.key);
    if (parsePct(o.ownership_pct) === null) err(3, 'PCT_INVALID', undefined, o.key);
    if (!isDate(o.start_date)) err(3, 'FIELD_REQUIRED', { field: 'start_date' }, o.key);
    if (o.end_date && (!isDate(o.end_date) || (isDate(o.start_date) && o.end_date < o.start_date))) err(3, 'DATE_ORDER', undefined, o.key);
  }
  if (state.owners.length > 0) {
    const segs = ownerSegments(state.owners);
    const badSum = segs.filter((s) => s.totalPct !== PCT_100);
    if (badSum.length) err(3, 'OWNER_PCT_SUM', { segments: badSum.map((s) => ({ from: s.from, total_pct: s.totalPct / 10_000 })) });
    const { min, max } = OWNER_LIMITS[form];
    const badCount = segs.filter((s) => s.ownerCount < min || (max !== null && s.ownerCount > max));
    if (badCount.length) err(3, 'OWNER_COUNT', { legal_form: form, min, max, segments: badCount.map((s) => ({ from: s.from, owners: s.ownerCount })) });

    const per = periodsOf(state.classifications);
    const overlaps = (o: ValidOwner, cls: Classification[]) =>
      per.some((q) => cls.includes(q.classification) && o.start <= (q.to ?? '9999-12-31') && (o.end ?? '9999-12-31') >= q.from);
    const vs = validOwners(state.owners);
    if (vs.some((o) => o.row.holder_type === 'entity' && overlaps(o, ['s_corp']))) err(3, 'OWNER_S_CORP_ENTITY');
    if (vs.some((o) => o.row.is_officer && !overlaps(o, ['s_corp', 'c_corp']))) warn(3, 'OFFICER_NOT_APPLICABLE');
  }

  /* Paso 4 */
  const rows = state.balances;
  if (rows.length === 0) { warn(4, 'BALANCE_EMPTY'); return out; }
  if (!isDate(state.as_of)) err(4, 'FIELD_REQUIRED', { field: 'as_of' }, 'as_of');
  const keys = new Set<string>();
  for (const r of rows) {
    if (!/^[123]\d{4}$/.test(r.account_code)) err(4, 'ACCOUNT_CODE_INVALID', undefined, r.key);
    if (toCents(r.amount) === null) err(4, 'AMOUNT_INVALID', undefined, r.key);
    if (looksLikeFullId(r.account_name)) err(4, 'ID_IN_TEXT', { field: 'account_name' }, r.key);
    const dup = `${r.account_code}|${r.persona_key ?? ''}`;
    if (keys.has(dup)) err(4, 'DUPLICATE_ROW', { field: 'account_code', value: r.account_code }, r.key);
    keys.add(dup);
  }
  const bc = balanceCheck(rows);
  if (!bc.balanced) err(4, 'BALANCE_UNBALANCED', { assets: bc.assets, liabilities: bc.liabilities, equity: bc.equity, diff: bc.diff });

  const cls = isDate(state.as_of) ? classificationOn(state.classifications, state.as_of) : null;
  if (cls) {
    const roles = new Set(EQUITY_TEMPLATES[cls].map((l) => l.role));
    for (const r of rows) {
      const role = equityCodeRole(r.account_code);
      if (r.account_code[0] === '3' && (role === null || (role !== 'opening_balance_equity' && !roles.has(role)))) {
        err(4, 'BALANCE_ACCOUNT_NOT_IN_TEMPLATE', { account_code: r.account_code, template: cls }, r.key);
      } else if (!r.persona_key && role && roleRequiresOwner(cls, role)) {
        err(4, 'BALANCE_OWNER_REQUIRED', { account_code: r.account_code, template: cls }, r.key);
      }
    }
  }
  const obe = rows.reduce((s, r) => (equityCodeRole(r.account_code) === 'opening_balance_equity' ? s + (toCents(r.amount) ?? 0) : s), 0);
  if (obe !== 0) warn(4, 'OPENING_BALANCE_EQUITY', { amount: obe });
  return out;
}

/**
 * Errores que impiden incluso guardar un borrador (la base los rechazaría). Los demás errores
 * (suma de %, número de dueños, cuadre…) solo bloquean "Siguiente" y la confirmación del alta:
 * el asistente se puede guardar a medias.
 */
export const DRAFT_BLOCKING: readonly Issue['code'][] = [
  'FIELD_REQUIRED', 'EIN_LAST4_FORMAT', 'DATE_ORDER', 'PCT_INVALID', 'AMOUNT_INVALID', 'ACCOUNT_CODE_INVALID',
  'DUPLICATE_ROW', 'ID_IN_TEXT', 'CLASS_INVALID_COMBO', 'OWNER_S_CORP_ENTITY',
];
export const draftErrors = (issues: Issue[], step: number) =>
  issues.filter((i) => i.step === step && i.severity === 'error' && DRAFT_BLOCKING.includes(i.code));

export const stepErrors = (issues: Issue[], step: number) => issues.filter((i) => i.step === step && i.severity === 'error');
/** Pasos 1 a 3 sin errores = el cliente puede procesar statements. */
export const statementsReady = (issues: Issue[]) => !issues.some((i) => i.step <= 3 && i.severity === 'error');
/** El alta se confirma solo sin errores en ningún paso. */
export const canComplete = (issues: Issue[]) => !issues.some((i) => i.severity === 'error');

/* ───────── Vista previa del catálogo de Equity (espejo de equity_provision_accounts) ───────── */

export interface PreviewAccount {
  code: string; name_en: string; name_es: string; role: EquityRole;
  persona_key: string | null; template: Classification; opened_on: string; closed_on: string | null;
}

export function provisionPreview(state: EntityState): PreviewAccount[] {
  if (!statementsReady(validateEntity(state))) return [];
  const out: PreviewAccount[] = [];
  const vs = validOwners(state.owners);
  const order = new Map(state.owners.map((o, i) => [o.key, i]));
  for (const per of periodsOf(state.classifications)) {
    const used = new Map<EquityRole, number>();
    for (const t of EQUITY_TEMPLATES[per.classification]) {
      if (!t.per_owner) {
        out.push({ code: t.code, name_en: t.name_en, name_es: t.name_es, role: t.role, persona_key: null, template: per.classification, opened_on: per.from, closed_on: per.to });
        continue;
      }
      // Una cuenta por PERSONA (un cambio de % no duplica cuentas), en orden de captura.
      const personas = new Map<string, { nombre: string; start: string; order: number }>();
      for (const o of vs) {
        if (!(o.start <= (per.to ?? '9999-12-31') && (o.end ?? '9999-12-31') >= per.from)) continue;
        const ord = order.get(o.row.key) ?? 0;
        const cur = personas.get(o.row.persona_key);
        personas.set(o.row.persona_key, {
          nombre: cur?.nombre ?? o.row.nombre.trim(),
          start: cur && cur.start <= o.start ? cur.start : o.start,
          order: cur ? Math.min(cur.order, ord) : ord,
        });
      }
      const sorted = Array.from(personas.entries()).sort((a, b) => a[1].start.localeCompare(b[1].start) || a[1].order - b[1].order);
      for (const [persona_key, pr] of sorted) {
        const n = used.get(t.role) ?? 0;
        used.set(t.role, n + 1);
        out.push({
          code: String(Number(t.code) + n), role: t.role, persona_key, template: per.classification,
          name_en: `${t.name_en} – ${pr.nombre}`, name_es: `${t.name_es} – ${pr.nombre}`,
          opened_on: per.from, closed_on: per.to,
        });
      }
    }
  }
  return out;
}
