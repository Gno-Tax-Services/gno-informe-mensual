import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateNarrative, isNarrativeConfigured } from '@/lib/narrative';

// La generación con Claude puede tardar; damos margen a la función serverless.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Genera (o regenera) el guion del video para un informe existente.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isNarrativeConfigured()) {
    return NextResponse.json(
      { error: 'Narrativa no configurada. Define ANTHROPIC_API_KEY en Vercel.' },
      { status: 501 }
    );
  }

  const { reportId } = await req.json();
  if (!reportId) {
    return NextResponse.json({ error: 'reportId es requerido' }, { status: 400 });
  }

  // Informe + cliente (join manual porque son dos tablas).
  const { data: report, error: rErr } = await supabase
    .from('reports')
    .select(
      'id, client_id, periodo, total_income, total_cogs, gross_profit, total_expenses, net_income, profit_margin, profitability_band'
    )
    .eq('id', reportId)
    .single();

  if (rErr || !report) {
    return NextResponse.json({ error: 'Informe no encontrado' }, { status: 404 });
  }

  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('nombre_dueno, nombre_compania, industria')
    .eq('id', report.client_id)
    .single();

  if (cErr || !client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  let script: string;
  try {
    script = await generateNarrative({
      nombreDueno: client.nombre_dueno,
      nombreCompania: client.nombre_compania,
      industria: client.industria,
      periodo: report.periodo,
      totalIncome: report.total_income,
      totalCogs: report.total_cogs,
      grossProfit: report.gross_profit,
      totalExpenses: report.total_expenses,
      netIncome: report.net_income,
      profitMargin: report.profit_margin,
      profitabilityBand: report.profitability_band,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error generando la narrativa: ${e.message}` },
      { status: 502 }
    );
  }

  const { error: uErr } = await supabase
    .from('reports')
    .update({ script, script_generated_at: new Date().toISOString() })
    .eq('id', reportId);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ script });
}
