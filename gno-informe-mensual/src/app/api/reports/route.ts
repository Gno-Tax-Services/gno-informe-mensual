import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Crea un informe mensual (borrador) para un cliente, con las métricas del mes.
// El video HeyGen y la narrativa se agregan en un paso posterior.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { clientId, periodo } = body;
  const totalIncome = Number(body.totalIncome) || 0;
  const totalCogs = Number(body.totalCogs) || 0;
  const totalExpenses = Number(body.totalExpenses) || 0;

  if (!clientId || !periodo) {
    return NextResponse.json(
      { error: 'clientId y periodo son requeridos' },
      { status: 400 }
    );
  }

  // Métricas derivadas.
  const grossProfit = totalIncome - totalCogs;
  const netIncome = grossProfit - totalExpenses;
  const profitMargin =
    totalIncome > 0 ? Number(((netIncome / totalIncome) * 100).toFixed(2)) : 0;

  const { data, error } = await supabase
    .from('reports')
    .insert({
      client_id: clientId,
      periodo,
      total_income: totalIncome,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_income: netIncome,
      profit_margin: profitMargin,
      status: 'draft',
      video_status: 'pending',
    })
    .select('id, periodo, net_income, profit_margin, status')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data });
}
