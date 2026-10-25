import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deleteHeygenVideo } from '@/lib/heygen';

export const maxDuration = 300;
export const runtime = 'nodejs';


function previousPeriod(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  // On the 20th we clean the month BEFORE the current month.
  // e.g. Oct 20 → clean "August 2026" (the report generated on Sep 25)
  const target = month <= 1 ? month + 10 : month - 2;
  const targetYear = month <= 1 ? year - 1 : year;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[target]} ${targetYear}`;
}

async function handleCleanup() {

  const periodo = previousPeriod();

  const { data: reports } = await supabaseAdmin()
    .from('reports')
    .select('id, heygen_video_id, video_url, client_id, periodo')
    .eq('periodo', periodo);

  if (!reports || reports.length === 0) {
    return NextResponse.json({ message: `No reports found for ${periodo}.`, deleted: 0 });
  }

  const results: Array<{ report_id: string; video_deleted: boolean; report_cleaned: boolean }> = [];

  for (const report of reports) {
    let videoDeleted = false;

    if (report.heygen_video_id) {
      try {
        videoDeleted = await deleteHeygenVideo(report.heygen_video_id);
      } catch {
        videoDeleted = false;
      }
    }

    const { error } = await supabaseAdmin()
      .from('reports')
      .update({
        video_url: null,
        heygen_video_id: null,
        video_status: null,
      })
      .eq('id', report.id);

    results.push({
      report_id: report.id,
      video_deleted: videoDeleted,
      report_cleaned: !error,
    });
  }

  return NextResponse.json({
    periodo,
    total: reports.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleCleanup();
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.BATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleCleanup();
}
