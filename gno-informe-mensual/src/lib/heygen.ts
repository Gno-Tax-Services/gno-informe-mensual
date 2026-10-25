// ─────────────────────────────────────────────────────────────
// Integración con HeyGen (API REST v2) para generar el video mensual
// a partir del guion. Usa el mismo avatar y voz del "Video de Bienvenida"
// para mantener el estilo consistente. IDs configurables por env.
// ─────────────────────────────────────────────────────────────

const HEYGEN_API = 'https://api.heygen.com';

const VOICE_ID = process.env.HEYGEN_VOICE_ID || '92383fef9184487ba575682b91706cda';

const LANDSCAPE_LOOKS: Array<{ id: string; name: string }> = [
  { id: 'f3ff6f7510394557b8165259bf64dfb2', name: 'Blue suit' },
  { id: '72d25546e22c4b7791f8a15550bd32fb', name: 'Olive shirt podcast' },
  { id: '6bf27c848c3b4dc59b2932f7e33c6e51', name: 'White shirt' },
  { id: '8b39717e79494e44aec531ccc2ff70be', name: 'Black hoodie podcast' },
  { id: '1533705091d261b19679e0da1d4bedf6', name: 'GNO Blue Suit' },
  { id: '2f792abd9b8440bb8739d95a9da9401a', name: 'Grey sweater podcast' },
  { id: 'c22317a42d2544d393e1c350430b34f9', name: 'Light grey blazer' },
  { id: '476f13780c3140f997f93abe370645cc', name: 'Blue hoodie podcast' },
  { id: '6ccc80f6538046e498c1e010200cec25', name: 'Fleet yard' },
  { id: '10ac3d354c7a4c509aa1e178e3b77a72', name: 'Grey hoodie podcast' },
  { id: '35b085e609c5406691ef829bba97d07b', name: 'Light blue shirt' },
  { id: 'c7ebca790ad343afac80aa418429c8f3', name: 'Fleet Manager' },
  { id: '5e8c0c7e33a54ee1b2c1d4e452915400', name: 'Blue suit alt' },
  { id: '87960119d39f4b80a0e1f43832d55da8', name: 'In the yard' },
  { id: '4ece45d64ba5464da41032f2a05d8961', name: 'White shirt alt' },
  { id: '7358af329dd545bcba1973112699d410', name: 'Rust shirt' },
  { id: '62387b2503be42ffb6c9551b9a06c3db', name: 'Light grey blazer alt' },
  { id: '5a70823300714bd0970826efeda62665', name: 'Light grey blazer wide' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthlyAvatarId(periodo: string): { id: string; name: string } {
  const parts = periodo.split(' ');
  const monthName = parts[0];
  const year = parseInt(parts[1] || '2026', 10);
  const monthIndex = MONTH_NAMES.indexOf(monthName);
  const idx = monthIndex >= 0 ? (year * 12 + monthIndex) % LANDSCAPE_LOOKS.length : 0;
  return LANDSCAPE_LOOKS[idx];
}

export function isHeygenConfigured(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

// Crea el video y devuelve el video_id de HeyGen (la generación es asíncrona).
export async function generateAvatarVideo(
  script: string,
  title = 'GNO Informe Mensual',
  avatarId?: string
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
            avatar_id: avatarId || LANDSCAPE_LOOKS[0].id,
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

// Elimina un video de HeyGen. No falla si ya no existe.
export async function deleteHeygenVideo(videoId: string): Promise<boolean> {
  const res = await fetch(`${HEYGEN_API}/v1/video.delete`, {
    method: 'DELETE',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ video_id: videoId }),
  });
  return res.ok;
}

// Mapea el estado de HeyGen al enum de la columna reports.video_status.
export function mapVideoStatus(heygen: string): 'pending' | 'processing' | 'ready' | 'error' {
  if (heygen === 'completed') return 'ready';
  if (heygen === 'failed') return 'error';
  return 'processing';
}
