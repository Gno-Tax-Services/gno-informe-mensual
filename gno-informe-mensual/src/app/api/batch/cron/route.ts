import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 300;
export const runtime = 'nodejs';


function currentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const prev = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[prev]} ${prevYear}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appUrl = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://gno-informe-mensual.vercel.app'
  ).replace(/\/+$/, '');

  const batchSecret = process.env.BATCH_SECRET;
  if (!batchSecret) {
    return NextResponse.json({ error: 'BATCH_SECRET not configured' }, { status: 501 });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${batchSecret}`,
  };

  // Check if there are pending videos to poll (processing or ready but unsent)
  const { data: pending } = await supabaseAdmin()
    .from('reports')
    .select('id')
    .eq('video_status', 'processing')
    .not('heygen_video_id', 'is', null)
    .limit(1);

  // Also check for videos ready but emails held (dispatch date pending)
  const { data: held } = await supabaseAdmin()
    .from('reports')
    .select('id')
    .eq('video_status', 'ready')
    .eq('status', 'draft')
    .not('video_url', 'is', null)
    .limit(1);

  const hasPending = (pending && pending.length > 0) || (held && held.length > 0);

  if (!hasPending) {
    const periodo = currentPeriod();
    const { data: periodReports } = await supabaseAdmin()
      .from('reports')
      .select('id')
      .eq('periodo', periodo)
      .limit(1);

    if (periodReports && periodReports.length > 0) {
      return NextResponse.json({ action: 'idle', message: `Batch already ran for ${periodo}, no pending videos.` });
    }

    const startRes = await fetch(`${appUrl}/api/batch/start`, {
      method: 'POST',
      headers,
    });
    const startData = await startRes.json();
    return NextResponse.json({ action: 'start', ...startData });
  }

  // Poll pending videos and send emails
  const pollRes = await fetch(`${appUrl}/api/batch/poll`, {
    method: 'POST',
    headers,
  });
  const pollData = await pollRes.json();
  return NextResponse.json({ action: 'poll', ...pollData });
}
