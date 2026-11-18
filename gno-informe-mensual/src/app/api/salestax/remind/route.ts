import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSms, isTwilioConfigured } from '@/lib/sms';
import {
  buildRecipients,
  previousPeriod,
  salesTaxMessage,
  type ProfileRow,
  type PeriodRow,
} from '@/lib/salestax-reminder';

export const maxDuration = 300;
export const runtime = 'nodejs';

/**
 * Recordatorio por SMS a clientes de sales tax que aún no enviaron ventas.
 *  - Cron de Vercel: día 15 (etapa "primero") y día 19 (etapa "urgente").
 *  - ?dry=1 devuelve a quién se le enviaría, sin enviar nada.
 *  - ?etapa=primero|urgente fuerza la etapa en una corrida manual.
 * Autorización: Bearer CRON_SECRET (cron) o Bearer BATCH_SECRET (manual).
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const ok =
    (process.env.CRON_SECRET && token === process.env.CRON_SECRET) ||
    (process.env.BATCH_SECRET && token === process.env.BATCH_SECRET);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const now = new Date();
  const dayLocal = Number(now.toLocaleString('en-US', { timeZone: 'America/Chicago', day: 'numeric' }));
  const forced = url.searchParams.get('etapa');
  const etapa: 'primero' | 'urgente' =
    forced === 'primero' || forced === 'urgente' ? forced : dayLocal >= 18 ? 'urgente' : 'primero';

  if (!dry && !isTwilioConfigured()) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 501 });
  }

  const { periodo, month, year } = previousPeriod(now);
  const db = supabaseAdmin();

  const { data: profs, error: e1 } = await db
    .from('sales_tax_profiles')
    .select(`client_id, frecuencia_estado, frecuencia_parroquia, tasa_estatal, tasa_parroquia,
             clients!inner ( nombre_compania, nombre_dueno, telefono, idioma, activo )`);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const profiles: ProfileRow[] = (profs || []).map((p: any) => ({
    client_id: p.client_id,
    frecuencia_estado: p.frecuencia_estado,
    frecuencia_parroquia: p.frecuencia_parroquia,
    tasa_estatal: p.tasa_estatal,
    tasa_parroquia: p.tasa_parroquia,
    ...p.clients,
  }));

  const { data: periods, error: e2 } = await db
    .from('sales_tax_periods')
    .select('client_id, ventas_brutas, estatus')
    .eq('periodo', periodo);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { recipients, skipped } = buildRecipients(profiles, (periods || []) as PeriodRow[], month);

  const { data: already } = await db
    .from('sms_logs')
    .select('telefono')
    .eq('kind', 'salestax_reminder')
    .eq('periodo', periodo)
    .eq('etapa', etapa)
    .eq('status', 'sent');
  const sentSet = new Set((already || []).map((r: any) => r.telefono));

  const details: Array<{ telefono: string; negocios: string[]; status: string; message?: string; error?: string }> = [];
  let sent = 0;
  let errors = 0;

  for (const r of recipients) {
    const message = salesTaxMessage(r, month, year, etapa);
    if (sentSet.has(r.telefono)) {
      details.push({ telefono: r.telefono, negocios: r.negocios, status: 'ya enviado' });
      continue;
    }
    if (dry) {
      details.push({ telefono: r.telefono, negocios: r.negocios, status: 'dry-run', message });
      continue;
    }
    try {
      const sid = await sendSms(r.telefono, message);
      await db.from('sms_logs').insert({
        client_id: r.client_ids[0], telefono: r.telefono, message, status: 'sent',
        provider_sid: sid, kind: 'salestax_reminder', periodo, etapa,
      });
      sent++;
      details.push({ telefono: r.telefono, negocios: r.negocios, status: 'enviado' });
    } catch (e: any) {
      await db.from('sms_logs').insert({
        client_id: r.client_ids[0], telefono: r.telefono, message, status: 'failed',
        error_detail: e.message, kind: 'salestax_reminder', periodo, etapa,
      });
      errors++;
      details.push({ telefono: r.telefono, negocios: r.negocios, status: 'falló', error: e.message });
    }
  }

  return NextResponse.json({ periodo, etapa, dry, sent, errors, recipients: recipients.length, skipped, details });
}
