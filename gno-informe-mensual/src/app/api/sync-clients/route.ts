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

    // Deduplica por (compañía + correo). Un correo puede tener varias compañías,
    // y una compañía varios contactos; lo único que no se repite es el par.
    const deduped = Array.from(
      new Map(rows.map((r) => [`${r.nombre_compania.toLowerCase()}||${r.email}`, r])).values()
    );
    const duplicates = rows.length - deduped.length;

    const { error } = await supabase
      .from('clients')
      .upsert(deduped, { onConflict: 'nombre_compania,email' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Reemplazo seguro (Opción A): marca "inactivo" a los clientes que YA NO
    // están en la lista de Drive (sin borrar → conserva historial de informes).
    const sheetKeys = new Set(
      deduped.map((r) => `${r.nombre_compania.toLowerCase()}||${r.email}`)
    );
    let deactivated = 0;
    const { data: existing } = await supabase
      .from('clients')
      .select('id, nombre_compania, email, activo');
    const toDeactivate = (existing ?? [])
      .filter(
        (c: any) =>
          c.activo &&
          !sheetKeys.has(`${(c.nombre_compania || '').toLowerCase()}||${c.email}`)
      )
      .map((c: any) => c.id);
    if (toDeactivate.length) {
      await supabase.from('clients').update({ activo: false }).in('id', toDeactivate);
      deactivated = toDeactivate.length;
    }

    return NextResponse.json({ synced: deduped.length, duplicates, deactivated });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Error sincronizando: ${e?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }
}
