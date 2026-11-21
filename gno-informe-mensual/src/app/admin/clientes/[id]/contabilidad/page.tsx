import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { isDemoMode } from '@/lib/demo';
import { loadEntity } from '@/lib/entity/server';
import { demoScenarioFor } from '@/lib/entity/demo-cases';
import { langOf } from '@/lib/entity/i18n';
import Asistente, { type Mode } from './Asistente';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /admin/clientes/[id]/contabilidad — alta contable del cliente: estructura, clasificación, dueños y saldos iniciales. */
export default async function Contabilidad({ params }: { params: { id: string } }) {
  const staff = await currentStaff();
  if (!staff) redirect('/login');
  if (!UUID.test(params.id)) notFound();

  const { data: client } = await supabaseAdmin()
    .from('clients').select('id, nombre_compania, idioma').eq('id', params.id).maybeSingle();
  if (!client) notFound();

  const demo = isDemoMode();
  // Demo: editable en pantalla (validación en vivo) pero nunca guarda. Sin permiso de staff: solo lectura.
  const mode: Mode = demo ? 'demo' : puede(staff, 'staff') ? 'edit' : 'readonly';
  let bundle;
  try {
    bundle = await loadEntity(client.id);
  } catch {
    return (
      <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        No se pudo leer el módulo de Entidad y Equity. Verifique que la migración 0013_entity_equity.sql esté aplicada en Supabase.
      </div>
    );
  }

  return (
    <Asistente
      clientId={client.id}
      clientName={client.nombre_compania}
      initialLang={langOf(client.idioma)}
      bundle={bundle}
      mode={mode}
      demo={demo ? demoScenarioFor(client.id) : null}
    />
  );
}
