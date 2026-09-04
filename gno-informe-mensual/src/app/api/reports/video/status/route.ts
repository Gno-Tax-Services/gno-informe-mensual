import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getVideoStatus, mapVideoStatus, isHeygenConfigured } from '@/lib/heygen';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Consulta el estado del video en HeyGen y actualiza el informe cuando esté listo.
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
    .select('id, heygen_video_id')
    .eq('id', reportId)
    .single();

  if (rErr || !report) {
    return NextResponse.json({ error: 'Informe no encontrado' }, { status: 404 });
  }
  if (!report.heygen_video_id) {
    return NextResponse.json(
      { error: 'Este informe aún no tiene video generado.' },
      { status: 400 }
    );
  }

  let heygen;
  try {
    heygen = await getVideoStatus(report.heygen_video_id);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  const videoStatus = mapVideoStatus(heygen.status);

  // Guarda la URL solo cuando el video está listo.
  const update: Record<string, unknown> = { video_status: videoStatus };
  if (videoStatus === 'ready' && heygen.url) {
    update.video_url = heygen.url;
  }
  await supabase.from('reports').update(update).eq('id', reportId);

  return NextResponse.json({
    status: videoStatus,
    url: videoStatus === 'ready' ? heygen.url : null,
    error: heygen.error,
  });
}
