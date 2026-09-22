import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAvatarVideo, getVideoStatus, mapVideoStatus, isHeygenConfigured } from '@/lib/heygen';
import { sendEmailViaGmail, isGmailSenderConfigured } from '@/lib/gmail';
import { buildWelcomeEmail, getWelcomeSubject } from '@/lib/email-template';
import crypto from 'crypto';

export const maxDuration = 300;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WELCOME_AVATAR_ID = '4ece45d64ba5464da41032f2a05d8961';
const WELCOME_PERIODO = 'Bienvenida';

const SCRIPTS: Record<string, string> = {
  es: `Hola, soy Jeiver González, fundador de Yee-No Tax and Business Center.

Quiero darte una gran noticia. A partir de este mes, vas a recibir cada mes un video personalizado con el resumen financiero de tu negocio.

¿Cómo funciona? Nuestro equipo analiza tu estado de resultados y prepara un reporte con las métricas más importantes: tus ingresos, gastos, ganancia neta y margen de rentabilidad. Todo explicado de forma clara y directa.

Cada día 25 recibirás un correo con tu video. Solo haz clic en el enlace y podrás ver tu reporte en menos de dos minutos.

Este servicio es parte de nuestro compromiso de mantenerte informado sobre la salud financiera de tu empresa, para que puedas tomar mejores decisiones.

Si tienes alguna pregunta, no dudes en contactarnos. Estamos aquí para ayudarte.

Un abrazo, Jey, el contador de la IA.`,

  en: `Hi, I'm Jeiver González, founder of Yee-No Tax and Business Center.

I have some exciting news for you. Starting this month, you will receive a personalized video every month with your business financial summary.

How does it work? Our team analyzes your profit and loss statement and prepares a report with the most important metrics: your revenue, expenses, net income, and profit margin. Everything explained clearly and directly.

On the 25th of each month, you will receive an email with your video. Just click the link and you can watch your report in under two minutes.

This service is part of our commitment to keeping you informed about your company's financial health, so you can make better decisions.

If you have any questions, don't hesitate to reach out. We are here to help.

Take care, Jay, the AI accountant.`,

  fr: `Bonjour, je suis Jeiver González, fondateur de Yee-No Tax and Business Center.

J'ai une excellente nouvelle pour vous. À partir de ce mois, vous recevrez chaque mois une vidéo personnalisée avec le résumé financier de votre entreprise.

Comment ça marche? Notre équipe analyse votre compte de résultat et prépare un rapport avec les indicateurs les plus importants: vos revenus, vos dépenses, votre bénéfice net et votre marge de rentabilité. Tout est expliqué de manière claire et directe.

Le 25 de chaque mois, vous recevrez un courriel avec votre vidéo. Il vous suffit de cliquer sur le lien pour voir votre rapport en moins de deux minutes.

Ce service fait partie de notre engagement à vous tenir informé de la santé financière de votre entreprise, afin que vous puissiez prendre de meilleures décisions.

Si vous avez des questions, n'hésitez pas à nous contacter. Nous sommes là pour vous aider.

Cordialement, Jey, le comptable de l'IA.`,

  pt: `Olá, sou Jeiver González, fundador da Yee-No Tax and Business Center.

Tenho uma ótima notícia para você. A partir deste mês, você vai receber todo mês um vídeo personalizado com o resumo financeiro do seu negócio.

Como funciona? Nossa equipe analisa sua demonstração de resultados e prepara um relatório com as métricas mais importantes: sua receita, despesas, lucro líquido e margem de rentabilidade. Tudo explicado de forma clara e direta.

No dia 25 de cada mês, você receberá um e-mail com seu vídeo. Basta clicar no link e você poderá assistir seu relatório em menos de dois minutos.

Este serviço faz parte do nosso compromisso de mantê-lo informado sobre a saúde financeira da sua empresa, para que você possa tomar melhores decisões.

Se tiver alguma dúvida, não hesite em nos contactar. Estamos aqui para ajudar.

Um abraço, Jey, o contador da IA.`,
};

function normalizeLang(idioma?: string | null): string {
  const raw = (idioma || 'espanol').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (raw.startsWith('en') || raw.startsWith('in')) return 'en';
  if (raw.startsWith('fr') || raw.startsWith('fran')) return 'fr';
  if (raw.startsWith('pt') || raw.startsWith('por')) return 'pt';
  return 'es';
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.BATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'start';

  if (action === 'start') return handleStart();
  if (action === 'poll') return handlePoll();
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

async function handleStart() {
  if (!isHeygenConfigured()) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 501 });
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, nombre_dueno, nombre_compania, email, idioma')
    .eq('activo', true);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ message: 'No active clients', processed: 0 });
  }

  // Check if welcome already started
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('periodo', WELCOME_PERIODO)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: 'Welcome batch already exists. Use action=poll to check status.', existing: existing.length });
  }

  // Group clients by language
  const byLang: Record<string, typeof clients> = {};
  for (const c of clients) {
    const lang = normalizeLang(c.idioma);
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(c);
  }

  // Generate one video per language
  const videoIds: Record<string, string> = {};
  const errors: Array<{ lang: string; error: string }> = [];

  for (const lang of Object.keys(byLang)) {
    const script = SCRIPTS[lang] || SCRIPTS.es;
    try {
      const videoId = await generateAvatarVideo(
        script,
        `GNO Welcome — ${lang.toUpperCase()}`,
        WELCOME_AVATAR_ID
      );
      videoIds[lang] = videoId;
    } catch (e: any) {
      errors.push({ lang, error: e.message });
    }
  }

  // Create a report record for each client linked to their language video
  let created = 0;
  for (const [lang, langClients] of Object.entries(byLang)) {
    const videoId = videoIds[lang];
    if (!videoId) continue;

    for (const client of langClients) {
      const { error: insertErr } = await supabase.from('reports').insert({
        client_id: client.id,
        periodo: WELCOME_PERIODO,
        heygen_video_id: videoId,
        video_status: 'processing',
        status: 'draft',
      });
      if (!insertErr) created++;
    }
  }

  return NextResponse.json({
    action: 'start',
    totalClients: clients.length,
    languages: Object.keys(videoIds),
    videosGenerated: Object.keys(videoIds).length,
    reportsCreated: created,
    videoIds,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function handlePoll() {
  if (!isGmailSenderConfigured()) {
    return NextResponse.json({ error: 'Gmail not configured' }, { status: 501 });
  }

  const { data: pending } = await supabase
    .from('reports')
    .select('id, client_id, heygen_video_id, video_status')
    .eq('periodo', WELCOME_PERIODO)
    .eq('video_status', 'processing')
    .not('heygen_video_id', 'is', null);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ message: 'No pending welcome videos', checked: 0, sent: 0 });
  }

  // Get unique video IDs to avoid redundant API calls
  const uniqueVideoIds = Array.from(new Set(pending.map(r => r.heygen_video_id)));
  const statusCache: Record<string, { status: string; url: string | null }> = {};

  for (const vid of uniqueVideoIds) {
    try {
      const heygen = await getVideoStatus(vid);
      statusCache[vid] = { status: mapVideoStatus(heygen.status), url: heygen.url };
    } catch (e: any) {
      statusCache[vid] = { status: 'processing', url: null };
    }
  }

  let checked = 0;
  let sent = 0;
  let errCount = 0;
  const details: Array<{ client: string; status: string; error?: string }> = [];

  for (const report of pending) {
    checked++;
    const cached = statusCache[report.heygen_video_id];

    if (cached.status === 'processing') {
      details.push({ client: report.client_id, status: 'still processing' });
      continue;
    }

    if (cached.status === 'error') {
      await supabase.from('reports').update({ video_status: 'error' }).eq('id', report.id);
      details.push({ client: report.client_id, status: 'video failed' });
      errCount++;
      continue;
    }

    // Video ready — update and send email
    await supabase
      .from('reports')
      .update({ video_status: 'ready', video_url: cached.url })
      .eq('id', report.id);

    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', report.client_id)
      .single();

    if (!client) {
      details.push({ client: report.client_id, status: 'client not found' });
      errCount++;
      continue;
    }

    try {
      const magicToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days for welcome
      await supabase
        .from('reports')
        .update({ magic_token: magicToken, magic_token_expires_at: expiresAt.toISOString() })
        .eq('id', report.id);

      const html = buildWelcomeEmail({
        nombre: client.nombre_dueno,
        compania: client.nombre_compania,
        videoUrl: cached.url!,
        magicToken,
        idioma: client.idioma,
      });

      const testEmail = process.env.GNO_TEST_EMAIL?.trim();
      const recipient = testEmail || client.email;
      const baseSubject = getWelcomeSubject(client.nombre_compania, client.idioma);
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
      details.push({ client: client.nombre_compania, status: 'welcome email sent' });
    } catch (e: any) {
      details.push({ client: client.nombre_compania, status: 'error (email)', error: e.message });
      errCount++;
    }
  }

  return NextResponse.json({ checked, sent, errors: errCount, details });
}
