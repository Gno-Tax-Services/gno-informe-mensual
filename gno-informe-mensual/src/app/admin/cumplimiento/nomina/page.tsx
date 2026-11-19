import { supabaseAdmin } from '@/lib/supabase-admin';
import { Aviso, Estado, Tabla, Titulo, fmtFecha, fmtMonto } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Nomina() {
  const db = supabaseAdmin();
  const [{ data, error }, { data: ult }] = await Promise.all([
    db.from('payroll_quarters').select('*, clients(nombre_compania)').order('anio', { ascending: false }).order('trimestre', { ascending: false }),
    db.from('entregas_ultima').select('entidad_id, entregado_en').eq('entidad', 'payroll_quarter'),
  ]);
  const ent = new Map((ult || []).map((u: any) => [u.entidad_id, u.entregado_en]));
  return (
    <>
      <Titulo>Nómina (941 · L-1 · SUTA · FUTA)</Titulo>
      {error && <Aviso>{error.message}</Aviso>}
      <Tabla
        cols={['Trimestre', 'Cliente', 'Empleados', 'Salarios', 'Fed WH', 'LA WH', 'Estatus', 'Entregado']}
        vacio="No hay trimestres registrados."
        rows={(data || []).map((q: any) => [
          `${q.anio} T${q.trimestre}`, q.clients?.nombre_compania, q.empleados ?? '—', fmtMonto(q.salarios),
          fmtMonto(q.fed_wh), fmtMonto(q.la_wh), <Estado key="e" v={q.estatus} />, fmtFecha(ent.get(q.id) as string),
        ])}
      />
    </>
  );
}
