import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateAvatarVideo, isHeygenConfigured } from '@/lib/heygen';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Dispara la generación del video HeyGen a partir del guion del informe.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isHeygenConfigured()) {
    return NextResponse.json(
      { error: 'HeyGen no configurado. Define HEYGEN_API_KEY en Vercel.' },
      { status: 501 }
    );
  }

  const { reportId } = await req.json();
  if (!reportId) {
    return NextResponse.json({ error: 'reportId es requerido' }, { status: 400 });
  }

  const { data: report, error: rErr } = await supabase
    .from('reports')
    .select('id, periodo, script, client_id')
    .eq('id', reportId)
    .single();

  if (rErr || !report) {
    return NextResponse.json({ error: 'Informe no encontrado' }, { status: 404 });
  }
  if (!report.script) {
    return NextResponse.json(
      { error: 'Genera el guion antes de crear el video.' },
      { status: 400 }
    );
  }

  const { data: client } = await supabase
    .from('clients')
    .select('nombre_compania')
    .eq('id', report.client_id)
    .single();

  let videoId: string;
  try {
    videoId = await generateAvatarVideo(
      report.script,
      `GNO ${client?.nombre_compania ?? ''} — ${report.periodo}`.trim()
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error creando el video en HeyGen: ${e.message}` },
      { status: 502 }
    );
  }

  await supabase
    .from('reports')
    .update({ heygen_video_id: videoId, video_status: 'processing' })
    .eq('id', reportId);

  return NextResponse.json({ videoId, status: 'processing' });
}
