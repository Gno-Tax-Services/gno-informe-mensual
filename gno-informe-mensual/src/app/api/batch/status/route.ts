import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.BATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const periodo = req.nextUrl.searchParams.get('periodo') || undefined;

  const { data: clients } = await supabase
    .from('clients')
    .select('id, nombre_compania, activo');

  const totalClients = clients?.length ?? 0;
  const activeClients = clients?.filter((c: any) => c.activo).length ?? 0;
  const clientIds = (clients ?? []).map((c: any) => c.id);

  let reportsQuery = supabase
    .from('reports')
    .select('id, client_id, periodo, status, video_status, created_at')
    .in('client_id', clientIds)
    .order('created_at', { ascending: false });

  if (periodo) {
    reportsQuery = reportsQuery.eq('periodo', periodo);
  } else {
    reportsQuery = reportsQuery.limit(200);
  }

  const { data: reports } = await reportsQuery;

  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('client_id, opened_at, created_at')
    .in('client_id', clientIds);

  const { data: smsLogs } = await supabase
    .from('sms_logs')
    .select('client_id, created_at')
    .in('client_id', clientIds);

  const emailsSent = new Set((emailLogs ?? []).map((e: any) => e.client_id)).size;
  const emailsOpened = new Set(
    (emailLogs ?? []).filter((e: any) => e.opened_at).map((e: any) => e.client_id)
  ).size;
  const smsSent = new Set((smsLogs ?? []).map((s: any) => s.client_id)).size;

  const reportsByPeriodo: Record<string, any> = {};
  for (const r of reports ?? []) {
    if (!reportsByPeriodo[r.periodo]) {
      reportsByPeriodo[r.periodo] = { total: 0, draft: 0, ready: 0, sent: 0, video_pending: 0, video_processing: 0, video_ready: 0, video_error: 0 };
    }
    const p = reportsByPeriodo[r.periodo];
    p.total++;
    if (r.status === 'draft') p.draft++;
    if (r.status === 'ready') p.ready++;
    if (r.status === 'sent') p.sent++;
    if (r.video_status === 'pending') p.video_pending++;
    if (r.video_status === 'processing') p.video_processing++;
    if (r.video_status === 'ready') p.video_ready++;
    if (r.video_status === 'error') p.video_error++;
  }

  const clientMap = new Map((clients ?? []).map((c: any) => [c.id, c.nombre_compania]));
  const emailMap = new Map<string, { sent: boolean; opened: boolean }>();
  for (const log of emailLogs ?? []) {
    const prev = emailMap.get(log.client_id);
    emailMap.set(log.client_id, {
      sent: true,
      opened: (prev?.opened || false) || !!log.opened_at,
    });
  }
  const smsSet = new Set((smsLogs ?? []).map((s: any) => s.client_id));

  const clientDetails = (clients ?? [])
    .filter((c: any) => c.activo)
    .map((c: any) => ({
      compania: c.nombre_compania,
      email_sent: emailMap.get(c.id)?.sent ?? false,
      email_opened: emailMap.get(c.id)?.opened ?? false,
      sms_sent: smsSet.has(c.id),
      reports: (reports ?? []).filter((r: any) => r.client_id === c.id).length,
    }))
    .sort((a: any, b: any) => a.compania.localeCompare(b.compania));

  return NextResponse.json({
    summary: {
      total_clients: totalClients,
      active_clients: activeClients,
      emails_sent: emailsSent,
      emails_opened: emailsOpened,
      sms_sent: smsSent,
      open_rate: emailsSent > 0 ? `${((emailsOpened / emailsSent) * 100).toFixed(1)}%` : '0%',
    },
    reports_by_periodo: reportsByPeriodo,
    clients: clientDetails,
  });
}
