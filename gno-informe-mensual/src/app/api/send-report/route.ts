import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendEmailViaGmail, isGmailSenderConfigured } from '@/lib/gmail';
import { buildReportEmail } from '@/lib/email-template';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// El envío por Gmail puede tardar (refresh de token + send); damos margen y
// garantizamos SIEMPRE una respuesta JSON.
export const maxDuration = 60;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();
    if (cErr || !client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    const { data: report, error: rErr } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();
    if (rErr || !report) {
      return NextResponse.json({ error: 'Informe no encontrado' }, { status: 404 });
    }

    // Magic token para la página pública /r/[token]
    const magicToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
    await supabase
      .from('reports')
      .update({ magic_token: magicToken, magic_token_expires_at: expiresAt.toISOString() })
      .eq('id', reportId);

    const html = buildReportEmail({
      nombre: client.nombre_dueno,
      compania: client.nombre_compania,
      periodo: report.periodo,
      videoUrl: report.video_url,
      magicToken,
    });
    // MODO PRUEBA: si GNO_TEST_EMAIL está definido, TODOS los correos van a esa
    // dirección (no a los clientes reales). Quitar/vaciar esa env var = producción.
    const testEmail = process.env.GNO_TEST_EMAIL?.trim();
    const recipient = testEmail || client.email;
    const subject = testEmail
      ? `[PRUEBA → ${client.email}] Informe Financiero — ${client.nombre_compania} · ${report.periodo}`
      : `Informe Financiero — ${client.nombre_compania} · ${report.periodo}`;

    // Envío por Gmail — capturamos el error real para poder diagnosticarlo.
    try {
      await sendEmailViaGmail(recipient, subject, html);
    } catch (e: any) {
      const detail =
        e?.response?.data?.error?.message ||
        e?.errors?.[0]?.message ||
        e?.message ||
        'error desconocido';
      return NextResponse.json(
        { error: `Error enviando por Gmail: ${detail}` },
        { status: 502 }
      );
    }

    // Log del envío (no bloquea la respuesta si falla)
    await supabase.from('email_logs').insert({
      client_id: clientId,
      report_id: reportId,
      sent_at: new Date().toISOString(),
      subject,
      status: 'sent',
    });

    if (!client.primer_email_enviado) {
      await supabase
        .from('clients')
        .update({ primer_email_enviado: true })
        .eq('id', clientId);
    }

    return NextResponse.json({ success: true, magicToken });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error inesperado: ${e?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }
}
