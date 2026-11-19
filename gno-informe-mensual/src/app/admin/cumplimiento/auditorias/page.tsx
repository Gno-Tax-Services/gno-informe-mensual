import { supabaseAdmin } from '@/lib/supabase-admin';
import { Aviso, Estado, Tabla, Titulo, fmtFecha, fmtMonto } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Auditorias() {
  const db = supabaseAdmin();
  const [{ data, error }, { data: ult }] = await Promise.all([
    db.from('audits').select('*, clients(nombre_compania)').order('fecha_limite', { ascending: true }),
    db.from('entregas_ultima').select('entidad_id, entregado_en').eq('entidad', 'audit'),
  ]);
  const entregada = new Map((ult || []).map((u: any) => [u.entidad_id, u.entregado_en]));
  return (
    <>
      <Titulo>Auditorías WC / GL</Titulo>
      {error && <Aviso>{error.message}</Aviso>}
      <Tabla
        cols={['Cliente', 'Tipo', 'Carrier', 'Póliza', 'Vence', 'Estado', 'Resultado', 'Entregada']}
        vacio="No hay auditorías registradas."
        rows={(data || []).map((a: any) => [
          a.clients?.nombre_compania, a.linea, a.carrier, a.poliza, a.fecha_limite ?? '—',
          <Estado key="e" v={a.estatus} />, fmtMonto(a.resultado ?? null), fmtFecha(entregada.get(a.id) as string),
        ])}
      />
    </>
  );
}
