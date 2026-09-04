// ─────────────────────────────────────────────────────────────
// Integración con HeyGen (API REST v2) para generar el video mensual
// a partir del guion. Usa el mismo avatar y voz del "Video de Bienvenida"
// para mantener el estilo consistente. IDs configurables por env.
// ─────────────────────────────────────────────────────────────

const HEYGEN_API = 'https://api.heygen.com';

// Defaults tomados del video de bienvenida real (jgonzalez@gnotbc.com).
// Alternativa del briefing (Blue Suit): 1533705091d261b19679e0da1d4bedf6
const AVATAR_ID = process.env.HEYGEN_AVATAR_ID || 'f3ff6f7510394557b8165259bf64dfb2';
const VOICE_ID = process.env.HEYGEN_VOICE_ID || '92383fef9184487ba575682b91706cda';

export function isHeygenConfigured(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

// Crea el video y devuelve el video_id de HeyGen (la generación es asíncrona).
export async function generateAvatarVideo(
  script: string,
  title = 'GNO Informe Mensual'
): Promise<string> {
  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      caption: false,
      dimension: { width: 1280, height: 720 }, // 16:9
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: AVATAR_ID,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: script,
            voice_id: VOICE_ID,
            speed: 1.0,
          },
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(
      data?.error?.message || data?.message || `HeyGen generate error ${res.status}`
    );
  }
  return data.data.video_id as string;
}

export type HeygenStatus = {
  status: string; // processing | pending | waiting | completed | failed
  url: string | null;
  error: string | null;
};

// Consulta el estado de un video en HeyGen.
export async function getVideoStatus(videoId: string): Promise<HeygenStatus> {
  const res = await fetch(
    `${HEYGEN_API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    { headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY! } }
  );
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `HeyGen status error ${res.status}`);
  }
  return {
    status: data.data.status,
    url: data.data.video_url ?? null,
    error: data.data.error?.message ?? null,
  };
}

// Mapea el estado de HeyGen al enum de la columna reports.video_status.
export function mapVideoStatus(heygen: string): 'pending' | 'processing' | 'ready' | 'error' {
  if (heygen === 'completed') return 'ready';
  if (heygen === 'failed') return 'error';
  return 'processing';
}
