import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findCompanyPnL, downloadPdfBase64, isDriveConfigured } from '@/lib/drive';
import { extractFinancialsFromPdf } from '@/lib/extract-financials';
import { generateNarrative, isNarrativeConfigured } from '@/lib/narrative';
import { generateAvatarVideo, isHeygenConfigured } from '@/lib/heygen';

export const maxDuration = 300;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function currentPeriod(): { periodo: string; monthLabel: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; on the 25th we report the PREVIOUS month
  const prev = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return {
    periodo: `${months[prev]} ${prevYear}`,
    monthLabel: `${prevYear}-${String(prev + 1).padStart(2, '0')}`,
  };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.BATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDriveConfigured() || !isNarrativeConfigured() || !isHeygenConfigured()) {
    return NextResponse.json(
      { error: 'Missing config: Drive, Anthropic, or HeyGen API keys.' },
      { status: 501 }
    );
  }

  const { periodo, monthLabel } = currentPeriod();

  const { data: clients } = await supabase
    .from('clients')
    .select('id, nombre_dueno, nombre_compania, email, industria, idioma')
    .eq('activo', true);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ message: 'No active clients found.', processed: 0 });
  }

  const results: Array<{ client: string; status: string; error?: string }> = [];

  for (const client of clients) {
    const logEntry = { client: client.nombre_compania, status: 'pending', error: undefined as string | undefined };

    try {
      const { data: existing } = await supabase
        .from('reports')
        .select('id')
        .eq('client_id', client.id)
        .eq('periodo', periodo)
        .maybeSingle();

      if (existing) {
        logEntry.status = 'skipped (report exists)';
        results.push(logEntry);
        continue;
      }

      // 1. Import P&L from Drive
      let metrics: any;
      try {
        const pnl = await findCompanyPnL(client.nombre_compania, monthLabel);
        const base64 = await downloadPdfBase64(pnl.id);
        metrics = await extractFinancialsFromPdf(base64, periodo);
      } catch (e: any) {
        logEntry.status = 'error (P&L)';
        logEntry.error = e.message;
        results.push(logEntry);
        continue;
      }

      // 2. Create report record
      const { data: report, error: rErr } = await supabase
        .from('reports')
        .insert({
          client_id: client.id,
          periodo,
          total_income: metrics.totalIncome,
          total_cogs: metrics.totalCogs,
          gross_profit: metrics.grossProfit,
          total_expenses: metrics.totalExpenses,
          net_income: metrics.netIncome,
          profit_margin: metrics.profitMargin,
          profitability_band: metrics.profitabilityBand,
          status: 'draft',
        })
        .select('id')
        .single();

      if (rErr || !report) {
        logEntry.status = 'error (create report)';
        logEntry.error = rErr?.message;
        results.push(logEntry);
        continue;
      }

      // 3. Generate script
      let script: string;
      try {
        script = await generateNarrative({
          nombreDueno: client.nombre_dueno,
          nombreCompania: client.nombre_compania,
          industria: client.industria,
          idioma: client.idioma,
          periodo,
          totalIncome: metrics.totalIncome,
          totalCogs: metrics.totalCogs,
          grossProfit: metrics.grossProfit,
          totalExpenses: metrics.totalExpenses,
          netIncome: metrics.netIncome,
          profitMargin: metrics.profitMargin,
          profitabilityBand: metrics.profitabilityBand,
        });
      } catch (e: any) {
        logEntry.status = 'error (script)';
        logEntry.error = e.message;
        results.push(logEntry);
        continue;
      }

      await supabase
        .from('reports')
        .update({ script, script_generated_at: new Date().toISOString() })
        .eq('id', report.id);

      // 4. Trigger HeyGen video
      let videoId: string;
      try {
        videoId = await generateAvatarVideo(
          script,
          `GNO ${client.nombre_compania} — ${periodo}`
        );
      } catch (e: any) {
        logEntry.status = 'error (video)';
        logEntry.error = e.message;
        results.push(logEntry);
        continue;
      }

      await supabase
        .from('reports')
        .update({ heygen_video_id: videoId, video_status: 'processing' })
        .eq('id', report.id);

      logEntry.status = 'video processing';
      results.push(logEntry);
    } catch (e: any) {
      logEntry.status = 'error (unexpected)';
      logEntry.error = e.message;
      results.push(logEntry);
    }
  }

  return NextResponse.json({
    periodo,
    total: clients.length,
    results,
  });
}
