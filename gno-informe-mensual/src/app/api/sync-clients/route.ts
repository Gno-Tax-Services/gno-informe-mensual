import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readClientList, isDriveConfigured } from '@/lib/drive';

export const maxDuration = 60;
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ID del Google Sheet "Client List" (configurable por env).
const CLIENT_LIST_SHEET_ID =
  process.env.GNO_CLIENT_LIST_SHEET_ID || '1bmPC4zMd-O64GIOg8iG9VgGzhUmAtz8mz1mo3MgcAoc';

// Lee el Client List de Drive y hace upsert de los clientes en Supabase.
export async function POST() {
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

    let clientes;
    try {
      clientes = await readClientList(CLIENT_LIST_SHEET_ID);
    } catch (e: any) {
      return NextResponse.json(
        { error: `No pude leer el Client List: ${e.message}` },
        { status: 502 }
      );
    }

    // Solo filas con correo (es la clave única).
    const rows = clientes
      .filter((c) => c.email)
      .map((c) => ({
        nombre_compania: c.compania || '(sin nombre)',
        nombre_dueno: c.nombre || '',
        email: c.email.toLowerCase(),
        telefono: c.telefono || null,
        idioma: c.idioma || null,
        activo: true,
      }));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'El Client List no tiene filas con correo.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('clients')
      .upsert(rows, { onConflict: 'email' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ synced: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error sincronizando: ${e?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }
}
