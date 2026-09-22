import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSms, getReminderMessage, isTwilioConfigured } from '@/lib/sms';

export const maxDuration = 300;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.BATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const periodo = body.periodo || 'Bienvenida';
  const hoursThreshold = body.hours || 48;

  const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

  const { data: unopened } = await supabase
    .from('email_logs')
    .select(`
      id,
      client_id,
      report_id,
      created_at,
      opened_at,
      clients!inner (
        id,
        nombre_dueno,
        telefono,
        idioma,
        nombre_compania
      )
    `)
    .eq('status', 'sent')
    .is('opened_at', null)
    .lt('created_at', cutoff)
    .not('clients.telefono', 'is', null);

  if (!unopened || unopened.length === 0) {
    return NextResponse.json({ message: 'No unopened emails to remind', reminded: 0 });
  }

  const { data: alreadySent } = await supabase
    .from('sms_logs')
    .select('client_id, report_id');

  const sentSet = new Set(
    (alreadySent || []).map((s: any) => `${s.client_id}:${s.report_id}`)
  );

  let reminded = 0;
  let skipped = 0;
  let errCount = 0;
  const details: Array<{ client: string; status: string; error?: string }> = [];

  for (const log of unopened) {
    const client = log.clients as any;
    if (!client?.telefono) {
      skipped++;
      continue;
    }

    const key = `${client.id}:${log.report_id}`;
    if (sentSet.has(key)) {
      skipped++;
      details.push({ client: client.nombre_compania, status: 'already reminded' });
      continue;
    }

    const message = getReminderMessage(client.nombre_dueno, client.idioma);

    try {
      const providerSid = await sendSms(client.telefono, message);

      await supabase.from('sms_logs').insert({
        client_id: client.id,
        report_id: log.report_id,
        telefono: client.telefono,
        message,
        status: 'sent',
        provider_sid: providerSid,
      });

      reminded++;
      details.push({ client: client.nombre_compania, status: 'sms sent' });
    } catch (e: any) {
      await supabase.from('sms_logs').insert({
        client_id: client.id,
        report_id: log.report_id,
        telefono: client.telefono,
        message,
        status: 'failed',
        error_detail: e.message,
      });

      errCount++;
      details.push({ client: client.nombre_compania, status: 'sms failed', error: e.message });
    }
  }

  return NextResponse.json({ reminded, skipped, errors: errCount, details });
}
