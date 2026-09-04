import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendEmailViaGmail, isGmailSenderConfigured } from '@/lib/gmail';
import { buildReportEmail } from '@/lib/email-template';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Auth check — must be logged in as GNO staff (la allowlist se aplica en
  // el callback signIn de NextAuth, así que basta con que exista sesión).
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // El envío usa una credencial de Gmail dedicada, no el token del login.
  if (!isGmailSenderConfigured()) {
    return NextResponse.json(
      {
        error:
          'Gmail sender no configurado. Define GMAIL_SENDER_REFRESH_TOKEN en Vercel.',
      },
      { status: 501 }
    );
  }

  const { clientId, reportId } = await req.json();

  // Fetch client + report from Supabase
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (cErr || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { data: report, error: rErr } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (rErr || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Generate magic token
  const magicToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await supabase
    .from('reports')
    .update({ magic_token: magicToken, magic_token_expires_at: expiresAt.toISOString() })
    .eq('id', reportId);

  // Build and send email
  const html = buildReportEmail({
    nombre: client.nombre_dueno,
    compania: client.nombre_compania,
    periodo: report.periodo,
    videoUrl: report.video_url,
    magicToken,
  });

  const subject = `Informe Financiero — ${client.nombre_compania} · ${report.periodo}`;

  await sendEmailViaGmail(client.email, subject, html);

  // Log the send
  await supabase.from('email_logs').insert({
    client_id: clientId,
    report_id: reportId,
    sent_at: new Date().toISOString(),
    subject,
    status: 'sent',
  });

  // Mark primer_email_enviado = true if first time
  if (!client.primer_email_enviado) {
    await supabase
      .from('clients')
      .update({ primer_email_enviado: true })
      .eq('id', clientId);
  }

  return NextResponse.json({ success: true, magicToken });
}
