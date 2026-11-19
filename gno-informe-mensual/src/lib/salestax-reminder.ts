// Lógica pura del recordatorio de sales tax (sin I/O) para poder probarla.

export type Freq = 'monthly' | 'quarterly';

export interface ProfileRow {
  client_id: string;
  frecuencia_estado: Freq;
  frecuencia_parroquia: Freq;
  tasa_estatal: number | null;
  tasa_parroquia: number | null;
  nombre_compania: string;
  nombre_dueno: string;
  telefono: string | null;
  idioma: string | null;
  activo: boolean;
}

export interface PeriodRow {
  client_id: string;
  ventas_brutas: number | null;
  estatus: string;
}

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Primer día del mes anterior a `now`, en hora de Louisiana. */
export function previousPeriod(now: Date): { periodo: string; month: number; year: number } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  let y = local.getFullYear();
  let m = local.getMonth() - 1; // 0-based
  if (m < 0) { m = 11; y -= 1; }
  return { periodo: `${y}-${String(m + 1).padStart(2, '0')}-01`, month: m, year: y };
}

/** Día 20 del mes siguiente al período (vencimiento LDR/parroquias). */
export function dueDay(month: number, year: number): { month: number; year: number } {
  return month === 11 ? { month: 0, year: year + 1 } : { month: month + 1, year };
}

function dueFor(freq: Freq, month: number): boolean {
  return freq === 'monthly' || [2, 5, 8, 11].includes(month);
}

/** ¿Le vence algún return (estado o parroquia) por este período? */
export function isDue(p: ProfileRow, month: number): boolean {
  const state = p.tasa_estatal !== null && dueFor(p.frecuencia_estado, month);
  const parish = dueFor(p.frecuencia_parroquia, month); // exento (tasa null) igual presenta en cero
  return state || parish;
}

/** ¿Ya tenemos las ventas del cliente para el período? */
export function hasSales(period?: PeriodRow): boolean {
  if (!period) return false;
  return period.ventas_brutas !== null || period.estatus !== 'pending_docs';
}

export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export interface Recipient {
  telefono: string;
  nombre: string;
  idioma: string;
  negocios: string[];
  client_ids: string[];
}

/** Agrupa por teléfono: un solo SMS para dueños con varios negocios. */
export function buildRecipients(
  profiles: ProfileRow[],
  periods: PeriodRow[],
  month: number,
): { recipients: Recipient[]; skipped: Array<{ negocio: string; motivo: string }> } {
  const byClient = new Map(periods.map((p) => [p.client_id, p]));
  const groups = new Map<string, Recipient>();
  const skipped: Array<{ negocio: string; motivo: string }> = [];
  for (const p of profiles) {
    if (!p.activo) { skipped.push({ negocio: p.nombre_compania, motivo: 'inactivo' }); continue; }
    if (!isDue(p, month)) { skipped.push({ negocio: p.nombre_compania, motivo: 'no vence este período' }); continue; }
    if (hasSales(byClient.get(p.client_id))) { skipped.push({ negocio: p.nombre_compania, motivo: 'ventas recibidas' }); continue; }
    const tel = p.telefono ? normalizePhone(p.telefono) : null;
    if (!tel) { skipped.push({ negocio: p.nombre_compania, motivo: 'sin teléfono válido' }); continue; }
    const g = groups.get(tel) ?? {
      telefono: tel,
      nombre: (p.nombre_dueno || '').split(/[ /]/)[0],
      idioma: p.idioma || 'espanol',
      negocios: [],
      client_ids: [],
    };
    g.negocios.push(p.nombre_compania);
    g.client_ids.push(p.client_id);
    groups.set(tel, g);
  }
  return { recipients: Array.from(groups.values()), skipped };
}

function joinList(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

export function salesTaxMessage(
  r: Recipient,
  month: number,
  year: number,
  etapa: 'primero' | 'urgente',
): string {
  const due = dueDay(month, year);
  const en = /^(en|in)/i.test(r.idioma);
  if (en) {
    const biz = joinList(r.negocios, 'and');
    const lead = etapa === 'urgente' ? 'URGENT: ' : '';
    return `${lead}Hi ${r.nombre}, this is GNO Tax & Business Center. The ${MESES_EN[month]} sales tax for ${biz} is due ${MESES_EN[due.month]} 20 and we have not received your sales yet. Please send your ${MESES_EN[month]} sales total (POS report, Clover/Square or deposits), cash and card separately. Thank you! 504-896-0276`;
  }
  const biz = joinList(r.negocios, 'y');
  const lead = etapa === 'urgente' ? 'URGENTE: ' : '';
  return `${lead}Hola ${r.nombre}, le saluda GNO Tax & Business Center. El sales tax de ${MESES_ES[month]} de ${biz} vence el 20 de ${MESES_ES[due.month]} y aún no hemos recibido sus ventas. Por favor envíenos el total de ventas de ${MESES_ES[month]} (reporte del POS, Clover/Square o depósitos), separando efectivo y tarjeta. Así evitamos multas e intereses. Gracias. 504-896-0276`;
}
