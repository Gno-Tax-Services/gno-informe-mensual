import { supabaseAdmin } from '@/lib/supabase-admin';

export const MODULOS = ['audit', 'sales_tax', 'payroll', 'informe', 'otro'] as const;
export const CANALES = ['email', 'portal', 'correo', 'fax', 'sms', 'en_persona', 'otro'] as const;
export const ENTIDADES = ['audit', 'sales_tax_period', 'payroll_quarter', 'report'] as const;

export interface NuevaEntrega {
  client_id: string;
  modulo: (typeof MODULOS)[number];
  entidad?: (typeof ENTIDADES)[number] | null;
  entidad_id?: string | null;
  tipo: string;
  periodo?: string | null;
  destinatario: string;
  destinatario_contacto?: string | null;
  canal: (typeof CANALES)[number];
  entregado_en?: string | null; // ISO; por defecto ahora
  confirmacion?: string | null;
  monto?: number | null;
  drive_folder_id?: string | null;
  drive_folder_url?: string | null;
  ubicacion?: string | null;
  notas?: string | null;
  documento_ids?: string[];
}

/** Valida la entrada; devuelve el primer error o null. */
export function validarEntrega(e: Partial<NuevaEntrega>): string | null {
  if (!e.client_id) return 'client_id es requerido';
  if (!e.modulo || !MODULOS.includes(e.modulo as any)) return 'modulo inválido';
  if (e.entidad && !ENTIDADES.includes(e.entidad as any)) return 'entidad inválida';
  if (!e.tipo?.trim()) return 'tipo es requerido';
  if (!e.destinatario?.trim()) return 'destinatario es requerido';
  if (!e.canal || !CANALES.includes(e.canal as any)) return 'canal inválido';
  if (e.entregado_en) {
    const t = Date.parse(e.entregado_en);
    if (Number.isNaN(t)) return 'entregado_en no es una fecha válida';
    if (t > Date.now() + 5 * 60 * 1000) return 'entregado_en no puede estar en el futuro';
  }
  if (e.monto != null && !Number.isFinite(Number(e.monto))) return 'monto inválido';
  if (e.drive_folder_url && !/^https:\/\/(drive|docs)\.google\.com\//.test(e.drive_folder_url)) {
    return 'drive_folder_url debe ser un link de Google Drive';
  }
  return null;
}

export async function registrarEntrega(e: NuevaEntrega, por: string) {
  const db = supabaseAdmin();
  const { documento_ids = [], ...row } = e;
  if (row.drive_folder_url && !row.drive_folder_id) {
    row.drive_folder_id = row.drive_folder_url.match(/folders\/([\w-]+)/)?.[1] ?? null;
  }
  for (const k of Object.keys(row) as (keyof typeof row)[]) {
    if (row[k] === '') (row as any)[k] = null;
  }
  const { data, error } = await db
    .from('entregas')
    .insert({ ...row, entregado_en: row.entregado_en || new Date().toISOString(), entregado_por: por })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (documento_ids.length) {
    const { error: e2 } = await db
      .from('entrega_documentos')
      .insert(documento_ids.map((documento_id) => ({ entrega_id: data.id, documento_id })));
    if (e2) throw new Error(`Entrega ${data.id} creada, pero falló el enlace de documentos: ${e2.message}`);
  }
  return data;
}

export async function anularEntrega(id: string, por: string, motivo: string) {
  if (!motivo?.trim()) throw new Error('El motivo es requerido');
  const { data, error } = await supabaseAdmin()
    .from('entregas')
    .update({ anulada_en: new Date().toISOString(), anulada_por: por, motivo_anulacion: motivo.trim() })
    .eq('id', id)
    .is('anulada_en', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Entrega no encontrada o ya anulada');
  return data;
}
