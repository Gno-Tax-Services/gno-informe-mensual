import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVideoStatus, mapVideoStatus, isHeygenConfigured } from '@/lib/heygen';
import { sendEmailViaGmail, isGmailSenderConfigured } from '@/lib/gmail';
import { buildReportEmail, getEmailSubject } from '@/lib/email-template';
import crypto from 'crypto';

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

  if (!isHeygenConfigured() || !isGmailSenderConfigured()) {
    return NextResponse.json(
      { error: 'Missing config: HeyGen or Gmail.' },
      { status: 501 }
    );
  }

  const { data: pending } = await supabase
    .from('reports')
    .select('id, client_id, periodo, heygen_video_id, video_status')
    .eq('video_status', 'processing')
    .not('heygen_video_id', 'is', null);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ message: 'No pending videos.', checked: 0, sent: 0 });
  }

  let checked = 0;
  let sent = 0;
  let errors = 0;
  const details: Array<{ client: string; status: string; error?: string }> = [];

  for (const report of pending) {
    checked++;
    let heygen;
    try {
      heygen = await getVideoStatus(report.heygen_video_id);
    } catch (e: any) {
      details.push({ client: report.client_id, status: 'error (status check)', error: e.message });
      errors++;
      continue;
    }

    const videoStatus = mapVideoStatus(heygen.status);

    if (videoStatus === 'processing') {
      details.push({ client: report.client_id, status: 'still processing' });
      continue;
    }

    if (videoStatus === 'error') {
      await supabase.from('reports').update({ video_status: 'error' }).eq('id', report.id);
      details.push({ client: report.client_id, status: 'video failed', error: heygen.error ?? undefined });
      errors++;
      continue;
    }

    // Video is ready — update URL and send email
    await supabase
      .from('reports')
      .update({ video_status: 'ready', video_url: heygen.url })
      .eq('id', report.id);

    // Fetch client info for email
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', report.client_id)
      .single();

    if (!client) {
      details.push({ client: report.client_id, status: 'error (client not found)' });
      errors++;
      continue;
    }

    try {
      // Generate magic token
      const magicToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await supabase
        .from('reports')
        .update({ magic_token: magicToken, magic_token_expires_at: expiresAt.toISOString() })
        .eq('id', report.id);

      const html = buildReportEmail({
        nombre: client.nombre_dueno,
        compania: client.nombre_compania,
        periodo: report.periodo,
        videoUrl: heygen.url!,
        magicToken,
        idioma: client.idioma,
      });

      const testEmail = process.env.GNO_TEST_EMAIL?.trim();
      const recipient = testEmail || client.email;
      const baseSubject = getEmailSubject(client.nombre_compania, report.periodo, client.idioma);
      const subject = testEmail
        ? `[PRUEBA > ${client.email}] ${baseSubject}`
        : baseSubject;

      await sendEmailViaGmail(recipient, subject, html);

      await supabase.from('email_logs').insert({
        client_id: client.id,
        report_id: report.id,
        sent_at: new Date().toISOString(),
        subject,
        status: 'sent',
      });

      if (!client.primer_email_enviado) {
        await supabase
          .from('clients')
          .update({ primer_email_enviado: true })
          .eq('id', client.id);
      }

      await supabase.from('reports').update({ status: 'sent' }).eq('id', report.id);

      sent++;
      details.push({ client: client.nombre_compania, status: 'email sent' });
    } catch (e: any) {
      details.push({ client: client.nombre_compania, status: 'error (email)', error: e.message });
      errors++;
    }
  }

  return NextResponse.json({ checked, sent, errors, details });
}
