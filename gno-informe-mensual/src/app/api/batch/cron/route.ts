import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Check if there are pending videos to poll
  const { data: pending } = await supabase
    .from('reports')
    .select('id')
    .eq('video_status', 'processing')
    .not('heygen_video_id', 'is', null)
    .limit(1);

  const hasPending = pending && pending.length > 0;

  // On the first run (no pending videos), start the batch
  if (!hasPending) {
    // Check if we already ran today by looking for reports created today
    const today = new Date().toISOString().split('T')[0];
    const { data: todayReports } = await supabase
      .from('reports')
      .select('id')
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1);

    if (todayReports && todayReports.length > 0) {
      return NextResponse.json({ action: 'idle', message: 'Batch already ran today, no pending videos.' });
    }

    // Start the batch
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
