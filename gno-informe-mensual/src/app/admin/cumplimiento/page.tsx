import { supabaseAdmin } from '@/lib/supabase-admin';
import { Tabla, Titulo, fmtFecha, DriveLink } from './ui';

export const dynamic = 'force-dynamic';

async function contar(tabla: string, filtro: (q: any) => any) {
  const { count } = await filtro(supabaseAdmin().from(tabla).select('*', { count: 'exact', head: true }));
  return count ?? 0;
}

export default async function Resumen() {
  const [audPend, stPend, prPend] = await Promise.all([
    contar('audits', (q) => q.not('estatus', 'in', '(sent,closed)')),
    contar('sales_tax_periods', (q) => q.not('estatus', 'in', '(filed,paid)')),
    contar('payroll_quarters', (q) => q.neq('estatus', 'filed')),
  ]);
  const { data: ult } = await supabaseAdmin()
    .from('entregas')
    .select('entregado_en, tipo, destinatario, canal, entregado_por, drive_folder_url, clients(nombre_compania)')
    .is('anulada_en', null)
    .order('entregado_en', { ascending: false })
    .limit(10);
  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[['Auditorías abiertas', audPend], ['Sales tax pendientes', stPend], ['Nómina pendiente', prPend]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-[#7FA3C4]">{l}</p>
            <p className="mt-1 font-serif text-3xl text-gold">{v}</p>
          </div>
        ))}
      </div>
      <Titulo>Últimas entregas</Titulo>
      <Tabla
        cols={['Fecha y hora', 'Cliente', 'Tipo', 'Destinatario', 'Canal', 'Por', 'Ubicación']}
        vacio="Aún no hay entregas registradas."
        rows={(ult || []).map((e: any) => [
          fmtFecha(e.entregado_en), e.clients?.nombre_compania, e.tipo, e.destinatario, e.canal, e.entregado_por,
          <DriveLink key="d" url={e.drive_folder_url} label="Carpeta" />,
        ])}
      />
    </>
  );
}
