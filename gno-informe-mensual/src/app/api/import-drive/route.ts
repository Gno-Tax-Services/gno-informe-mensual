import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { findCompanyPnL, downloadPdfBase64, isDriveConfigured } from '@/lib/drive';
import { extractFinancialsFromPdf } from '@/lib/extract-financials';
import { isNarrativeConfigured } from '@/lib/narrative';

// Descargar el PDF + leerlo con Claude puede tardar; damos margen.
export const maxDuration = 60;
export const runtime = 'nodejs';

// Lee el P&L (PDF) de una empresa desde Drive y extrae las métricas con Claude.
// Body: { company, monthLabel, periodo? }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: 'Drive no configurado. Define GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.' },
        { status: 501 }
      );
    }
    if (!isNarrativeConfigured()) {
      return NextResponse.json(
        { error: 'Falta ANTHROPIC_API_KEY (necesaria para leer el P&L).' },
        { status: 501 }
      );
    }

    const body = await req.json();
    const company = (body.company || '').toString().trim();
    const monthLabel = (body.monthLabel || '').toString().trim();
    const periodo = (body.periodo || monthLabel).toString().trim();

    if (!company || !monthLabel) {
      return NextResponse.json(
        { error: 'company y monthLabel son requeridos' },
        { status: 400 }
      );
    }

    // 1) Ubicar el P&L en Drive
    let pnl;
    try {
      pnl = await findCompanyPnL(company, monthLabel);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }

    // 2) Descargar el PDF
    const base64 = await downloadPdfBase64(pnl.id);

    // 3) Extraer métricas con Claude
    const metrics = await extractFinancialsFromPdf(base64, periodo);

    return NextResponse.json({ source: pnl.name, ...metrics });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error importando de Drive: ${e?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }
}
