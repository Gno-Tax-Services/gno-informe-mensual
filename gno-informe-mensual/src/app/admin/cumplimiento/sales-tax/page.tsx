import { supabaseAdmin } from '@/lib/supabase-admin';
import { Aviso, Estado, Tabla, Titulo, fmtFecha, fmtMonto } from '../ui';

export const dynamic = 'force-dynamic';

export default async function SalesTax() {
  const db = supabaseAdmin();
  const [{ data, error }, { data: ult }] = await Promise.all([
    db.from('sales_tax_periods').select('*, clients(nombre_compania)').order('periodo', { ascending: false }).limit(300),
    db.from('entregas_ultima').select('entidad_id, entregado_en, confirmacion').eq('entidad', 'sales_tax_period'),
  ]);
  const ent = new Map((ult || []).map((u: any) => [u.entidad_id, u]));
  return (
    <>
      <Titulo>Sales Tax</Titulo>
      {error && <Aviso>{error.message}</Aviso>}
      <Tabla
        cols={['Período', 'Cliente', 'Ventas', 'Estado (LA)', 'Parroquia', 'Estatus', 'Presentado', 'Confirmación']}
        vacio="No hay períodos registrados."
        rows={(data || []).map((p: any) => {
          const e: any = ent.get(p.id);
          return [
            String(p.periodo).slice(0, 7), p.clients?.nombre_compania, fmtMonto(p.ventas_brutas),
            fmtMonto(p.impuesto_estado), fmtMonto(p.impuesto_parroquia), <Estado key="e" v={p.estatus} />,
            fmtFecha(e?.entregado_en ?? p.presentado_en), e?.confirmacion ?? p.confirmacion_estado ?? '—',
          ];
        })}
      />
    </>
  );
}
