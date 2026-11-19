import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { ensureFolderPath, fileMetadata, isDriveWriteConfigured, uploadFile } from '@/lib/compliance/drive-files';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ENTIDADES = ['audit', 'sales_tax_period', 'payroll_quarter', 'client'];
// Vercel limita el cuerpo de la solicitud a ~4.5 MB: archivos más grandes se
// suben directo a Drive y aquí se registran con su drive_file_id.
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Registra un documento (el archivo queda en Drive; aquí solo la referencia).
 *  - multipart/form-data: file, client_id, entidad, entidad_id?, carpeta ("AA LSU/WC 2025-2026")
 *  - application/json: { drive_file_id, client_id, entidad, entidad_id? } para un archivo que ya está en Drive
 */
export async function POST(req: NextRequest) {
  const staff = await currentStaff();
  if (!puede(staff, 'staff')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDriveWriteConfigured()) return NextResponse.json({ error: 'Drive no configurado' }, { status: 501 });

  const ct = req.headers.get('content-type') || '';
  let client_id: string, entidad: string, entidad_id: string | null;
  let info: Awaited<ReturnType<typeof uploadFile>>;
  let drive_folder_id: string | null = null;
  let ubicacion: string | null = null;

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      client_id = String(form.get('client_id') || '');
      entidad = String(form.get('entidad') || '');
      entidad_id = (form.get('entidad_id') as string) || null;
      const carpeta = String(form.get('carpeta') || '').split('/').map((s) => s.trim()).filter(Boolean);
      if (!(file instanceof File)) return NextResponse.json({ error: 'file es requerido' }, { status: 400 });
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Archivo mayor a 4 MB: súbalo a Drive y regístrelo con drive_file_id' }, { status: 413 });
      }
      if (!carpeta.length) return NextResponse.json({ error: 'carpeta es requerida' }, { status: 400 });
      if (!client_id || !ENTIDADES.includes(entidad)) return NextResponse.json({ error: 'client_id/entidad inválidos' }, { status: 400 });
      const folder = await ensureFolderPath(carpeta);
      drive_folder_id = folder.id;
      ubicacion = folder.ubicacion;
      info = await uploadFile(folder.id, file.name, file.type || 'application/octet-stream', Buffer.from(await file.arrayBuffer()));
    } else {
      const body = await req.json();
      client_id = body.client_id;
      entidad = body.entidad;
      entidad_id = body.entidad_id || null;
      if (!body.drive_file_id || !client_id || !ENTIDADES.includes(entidad)) {
        return NextResponse.json({ error: 'drive_file_id, client_id y entidad son requeridos' }, { status: 400 });
      }
      const meta = await fileMetadata(String(body.drive_file_id));
      drive_folder_id = meta.parent;
      ubicacion = body.ubicacion || null;
      info = meta;
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Drive: ${e.message}` }, { status: 502 });
  }

  const { data, error } = await supabaseAdmin()
    .from('compliance_documents')
    .upsert(
      { client_id, entidad, entidad_id, ...info, drive_folder_id, ubicacion, subido_por: staff.email, borrado_en: null },
      { onConflict: 'drive_file_id' },
    )
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
