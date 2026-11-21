import type { Classification, IssueCode, OwnerInput } from './types';
import { allocate } from './money';
import { daysInclusive, fiscalYearWindow, maxDate, minDate } from './dates';
import { validOwners, type ValidOwner } from './rules';

/**
 * Reglas de cierre y asignación (spec). Todo en centavos enteros.
 * Son funciones puras: el motor de transacciones (módulo siguiente) les pasa utilidad y movimientos
 * reales; el modo demo les pasa cifras ficticias.
 */

/* ───────── Reparto por participación y días ───────── */

export interface Share { persona_key: string; nombre: string; weight: number }

/** Orden estable de personas: primera fecha de inicio y luego orden de captura (igual que la numeración de cuentas). */
export function personaOrder(owners: OwnerInput[]): { persona_key: string; nombre: string }[] {
  const first = new Map<string, { nombre: string; start: string; order: number }>();
  const vs = validOwners(owners);
  const idx = new Map(owners.map((o, i) => [o.key, i]));
  for (const o of vs) {
    const ord = idx.get(o.row.key) ?? 0;
    const cur = first.get(o.row.persona_key);
    first.set(o.row.persona_key, {
      nombre: cur?.nombre ?? o.row.nombre.trim(),
      start: cur && cur.start <= o.start ? cur.start : o.start,
      order: cur ? Math.min(cur.order, ord) : ord,
    });
  }
  return Array.from(first.entries())
    .sort((a, b) => a[1].start.localeCompare(b[1].start) || a[1].order - b[1].order)
    .map(([persona_key, v]) => ({ persona_key, nombre: v.nombre }));
}

/**
 * Peso de cada persona en [from, to]: Σ (porcentaje × días vigentes). Si el % cambió en el periodo
 * el peso refleja el prorrateo por días de la spec.
 */
export function ownerWeights(owners: OwnerInput[], from: string, to: string): Share[] {
  const order = personaOrder(owners);
  const vs = validOwners(owners);
  return order.map(({ persona_key, nombre }) => {
    const weight = vs
      .filter((o) => o.row.persona_key === persona_key)
      .reduce((w, o: ValidOwner) => w + o.pct * daysInclusive(maxDate(o.start, from), minDate(o.end ?? to, to)), 0);
    return { persona_key, nombre, weight };
  });
}

export interface Allocation { persona_key: string; nombre: string; cents: number }

export function allocateByWeights(totalCents: number, shares: Share[]): Allocation[] {
  const parts = allocate(totalCents, shares.map((s) => s.weight));
  return shares.map((s, i) => ({ persona_key: s.persona_key, nombre: s.nombre, cents: parts[i] }));
}

/** Utilidad del ejercicio repartida por % y días (caso 5: 50/50 → 70/30 el 01/07). */
export function allocateProfit(owners: OwnerInput[], year: number, fiscalYearEnd: string, profitCents: number): Allocation[] {
  const w = fiscalYearWindow(year, fiscalYearEnd);
  return allocateByWeights(profitCents, ownerWeights(owners, w.start, w.end));
}

/* ───────── Asiento de cierre al fin de año ───────── */

export const NET_INCOME = 'NET_INCOME';

export interface LedgerLine { account: string; persona_key: string | null; debit: number; credit: number }
export interface LedgerEntry { id: string; lines: LedgerLine[] }

export interface ClosingInput {
  classification: Classification;
  owners: OwnerInput[];
  year: number;
  fiscalYearEnd?: string;
  profitCents: number;
  /** Capital al inicio por persona (en disregarded se usa la clave '_' o la del único dueño). */
  openingCapital?: Record<string, number>;
  /** Ajustes de años anteriores; se reparten con los mismos pesos que la utilidad. */
  priorAdjustmentsCents?: number;
  contributions?: Record<string, number>;
  withdrawals?: Record<string, number>;
}

export interface OwnerEnding {
  persona_key: string; nombre: string;
  opening: number; adjustments: number; profit: number; contributions: number; withdrawals: number; ending: number;
}
export interface ClosingResult {
  entries: LedgerEntry[];
  /** Capital final por dueño (disregarded y partnership). Vacío en corporaciones. */
  owners: OwnerEnding[];
  /** Corporaciones: movimiento de 32000 Retained Earnings. */
  retainedEarnings?: { profit: number; distributions: number; change: number };
  totalEnding: number;
}

const sum = (r?: Record<string, number>) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);
const dr = (account: string, cents: number, persona_key: string | null = null): LedgerLine => ({ account, persona_key, debit: cents, credit: 0 });
const cr = (account: string, cents: number, persona_key: string | null = null): LedgerLine => ({ account, persona_key, debit: 0, credit: cents });
/** Monto con signo → línea al lado natural (utilidad negativa invierte el asiento). */
const signed = (account: string, cents: number, side: 'debit' | 'credit', persona_key: string | null = null): LedgerLine =>
  (cents >= 0) === (side === 'debit') ? dr(account, Math.abs(cents), persona_key) : cr(account, Math.abs(cents), persona_key);

export function closeYear(input: ClosingInput): ClosingResult {
  const { classification: cls, owners, year, profitCents } = input;
  const fye = input.fiscalYearEnd ?? '12-31';
  const win = fiscalYearWindow(year, fye);
  const people = personaOrder(owners);
  if (!people.length) throw new Error('closeYear: no hay dueños');
  const entries: LedgerEntry[] = [];
  const contrib = input.contributions ?? {};
  const draws = input.withdrawals ?? {};

  if (cls === 'disregarded') {
    if (people.length !== 1) throw new Error('closeYear: disregarded exige un solo dueño');
    const p = people[0];
    const opening = sum(input.openingCapital);
    const adj = input.priorAdjustmentsCents ?? 0;
    const c = sum(contrib), w = sum(draws);
    if (profitCents) entries.push({ id: 'profit', lines: [signed(NET_INCOME, profitCents, 'debit'), signed('30000', profitCents, 'credit', p.persona_key)] });
    if (w) entries.push({ id: 'draws', lines: [dr('30000', w, p.persona_key), cr('30700', w, p.persona_key)] });
    if (c) entries.push({ id: 'contributions', lines: [dr('30500', c, p.persona_key), cr('30000', c, p.persona_key)] });
    const ending = opening + adj + profitCents + c - w;
    return { entries, owners: [{ persona_key: p.persona_key, nombre: p.nombre, opening, adjustments: adj, profit: profitCents, contributions: c, withdrawals: w, ending }], totalEnding: ending };
  }

  if (cls === 'partnership') {
    const shares = ownerWeights(owners, win.start, win.end);
    const profit = allocateByWeights(profitCents, shares);
    const adj = allocateByWeights(input.priorAdjustmentsCents ?? 0, shares);
    const rows: OwnerEnding[] = [];
    const lines: Record<string, LedgerLine[]> = { profit: [], draws: [], contributions: [] };
    people.forEach((p, n) => {
      const capital = String(30100 + n), contribAcc = String(30500 + n), drawAcc = String(30700 + n);
      const pr = profit[n].cents, ad = adj[n].cents, c = contrib[p.persona_key] ?? 0, w = draws[p.persona_key] ?? 0;
      const opening = input.openingCapital?.[p.persona_key] ?? 0;
      if (pr) lines.profit.push(signed(capital, pr, 'credit', p.persona_key));
      if (w) lines.draws.push(dr(capital, w, p.persona_key), cr(drawAcc, w, p.persona_key));
      if (c) lines.contributions.push(dr(contribAcc, c, p.persona_key), cr(capital, c, p.persona_key));
      rows.push({ persona_key: p.persona_key, nombre: p.nombre, opening, adjustments: ad, profit: pr, contributions: c, withdrawals: w, ending: opening + ad + pr + c - w });
    });
    if (profitCents) entries.push({ id: 'profit', lines: [signed(NET_INCOME, profitCents, 'debit'), ...lines.profit] });
    if (lines.draws.length) entries.push({ id: 'draws', lines: lines.draws });
    if (lines.contributions.length) entries.push({ id: 'contributions', lines: lines.contributions });
    return { entries, owners: rows, totalEnding: rows.reduce((a, r) => a + r.ending, 0) };
  }

  // S-corp y C-corp: utilidad → 32000; 33000/34000 se cierran contra 32000
  const dist = cls === 's_corp' ? '33000' : '34000';
  const total = sum(draws);
  if (profitCents) entries.push({ id: 'profit', lines: [signed(NET_INCOME, profitCents, 'debit'), signed('32000', profitCents, 'credit')] });
  const dl: LedgerLine[] = [];
  people.forEach((p, n) => {
    const w = draws[p.persona_key] ?? 0;
    if (w) dl.push(dr('32000', w, p.persona_key), cr(String(Number(dist) + n), w, p.persona_key));
  });
  if (dl.length) entries.push({ id: 'distributions', lines: dl });
  return { entries, owners: [], retainedEarnings: { profit: profitCents, distributions: total, change: profitCents - total }, totalEnding: profitCents - total };
}

export const isBalanced = (e: LedgerEntry) =>
  e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);

/* ───────── Cambio de clasificación: asiento de conversión ───────── */

export interface ConversionInput {
  to: Classification;
  /** Saldos de capital de la plantilla anterior que se cierran (p. ej. 30000 Owner's Capital). */
  fromAccounts: { code: string; cents: number; persona_key?: string | null }[];
  /** Reparto indicado por GNO. NUNCA se calcula en automático. */
  commonStockCents?: number;
  apicCents?: number;
}
export interface ConversionResult {
  /** ready: listo para contabilizar · pending_split: falta el reparto de GNO · manual: destino sin regla (GNO decide) */
  status: 'ready' | 'pending_split' | 'manual';
  lines: LedgerLine[];
  totalCents: number;
  unallocatedCents: number;
}

export function conversionEntry(input: ConversionInput): ConversionResult {
  const total = input.fromAccounts.reduce((s, a) => s + a.cents, 0);
  if (input.to !== 's_corp' && input.to !== 'c_corp') return { status: 'manual', lines: [], totalCents: total, unallocatedCents: total };
  const cs = input.commonStockCents, ap = input.apicCents;
  const given = (cs ?? 0) + (ap ?? 0);
  if (cs === undefined && ap === undefined) return { status: 'pending_split', lines: [], totalCents: total, unallocatedCents: total };
  if (total < 0 || cs! < 0 || ap! < 0 || given !== total) return { status: 'pending_split', lines: [], totalCents: total, unallocatedCents: total - given };
  const lines: LedgerLine[] = input.fromAccounts.filter((a) => a.cents).map((a) => dr(a.code, a.cents, a.persona_key ?? null));
  if (cs) lines.push(cr('31000', cs));
  if (ap) lines.push(cr('31500', ap));
  return { status: 'ready', lines, totalCents: total, unallocatedCents: 0 };
}

/* ───────── Alertas y bloqueos de cierre ───────── */

export interface Alert { code: IssueCode; severity: 'warn' | 'error'; detail?: Record<string, unknown> }

/** Diferencia tolerada entre lo distribuido y lo proporcional antes de avisar ($1). */
export const PROPORTION_TOLERANCE_CENTS = 100;

export interface AlertInput {
  classification: Classification;
  owners: OwnerInput[];
  year: number;
  fiscalYearEnd?: string;
  profitCents: number;
  openingCapitalTotal?: number;
  withdrawals?: Record<string, number>;
  closing?: ClosingResult;
  /** Sueldos en nómina del año; undefined = no se conoce (no se alerta). */
  payrollCents?: number | null;
  /** Retiros o aportes sin dueño (bloquea el cierre si hay más de un dueño). */
  unassignedCount?: number;
  /** C-corp: pagos a accionistas sin sueldo ni préstamo documentado. */
  undocumentedShareholderPayments?: number;
}

export function reviewAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  const draws = i.withdrawals ?? {};
  const totalDraws = sum(draws);
  const people = personaOrder(i.owners);
  const win = fiscalYearWindow(i.year, i.fiscalYearEnd ?? '12-31');

  if ((i.unassignedCount ?? 0) > 0 && people.length > 1) {
    out.push({ code: 'UNASSIGNED_MOVEMENTS', severity: 'error', detail: { count: i.unassignedCount } });
  }
  if (i.classification === 's_corp') {
    if (i.payrollCents === 0 && validOwners(i.owners).some((o) => o.row.is_officer)) {
      out.push({ code: 'S_CORP_OFFICER_NO_PAYROLL', severity: 'warn', detail: { year: i.year } });
    }
    if (totalDraws > 0) {
      const expected = allocateByWeights(totalDraws, ownerWeights(i.owners, win.start, win.end));
      const off = expected
        .map((e) => ({ persona_key: e.persona_key, nombre: e.nombre, expected: e.cents, actual: draws[e.persona_key] ?? 0 }))
        .filter((r) => Math.abs(r.actual - r.expected) > PROPORTION_TOLERANCE_CENTS);
      if (off.length) out.push({ code: 'DISTRIBUTIONS_NOT_PROPORTIONAL', severity: 'warn', detail: { owners: off } });
    }
  }
  if (i.classification === 'c_corp' && (i.undocumentedShareholderPayments ?? 0) > 0) {
    out.push({ code: 'DIVIDEND_REVIEW', severity: 'warn', detail: { count: i.undocumentedShareholderPayments } });
  }
  const neg = (i.closing?.owners ?? []).filter((o) => o.ending < 0);
  if (neg.length) out.push({ code: 'NEGATIVE_CAPITAL', severity: 'warn', detail: { owners: neg.map((o) => ({ nombre: o.nombre, ending: o.ending })) } });
  if (totalDraws > i.profitCents + (i.openingCapitalTotal ?? 0)) {
    out.push({ code: 'WITHDRAWALS_EXCEED_PROFIT', severity: 'warn', detail: { withdrawals: totalDraws, profit: i.profitCents, opening: i.openingCapitalTotal ?? 0 } });
  }
  return out;
}
