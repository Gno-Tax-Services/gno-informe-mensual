import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// En modo DEMO la app es de solo lectura: ninguna API escribe, envía SMS/emails,
// genera videos ni toca Drive, y los crons no corren.
const DEMO_BLOQUEADAS_GET = [
  '/api/batch', '/api/salestax', '/api/sync-clients', '/api/import-drive', '/api/send-report',
  '/api/compliance/identificadores',
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (process.env.GNO_DEMO_MODE === '1' && path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
    const escritura = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const bloqueadaGet = DEMO_BLOQUEADAS_GET.some((p) => path === p || path.startsWith(`${p}/`));
    if (escritura || bloqueadaGet) {
      return NextResponse.json({ error: 'Modo demo: solo lectura' }, { status: 403 });
    }
  }

  if (!path.startsWith('/api/batch')) return NextResponse.next();

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
