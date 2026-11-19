import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentStaff, puede } from '@/lib/compliance/staff';
import { Aviso, DriveLink, Tabla, Titulo, fmtFecha, fmtMonto } from '../ui';
import NuevaEntregaForm from './NuevaEntregaForm';

export const dynamic = 'force-dynamic';

export default async function Entregas({ searchParams }: { searchParams: { modulo?: string; anuladas?: string } }) {
  const staff = await currentStaff();
  const db = supabaseAdmin();
  let q = db
    .from('entregas')
    .select('*, clients(nombre_compania), entrega_documentos(compliance_documents(nombre, drive_url))')
    .order('entregado_en', { ascending: false })
    .limit(300);
  if (searchParams.modulo) q = q.eq('modulo', searchParams.modulo);
  if (searchParams.anuladas !== '1') q = q.is('anulada_en', null);
  const [{ data, error }, { data: clientes }] = await Promise.all([
    q,
    db.from('clients').select('id, nombre_compania').eq('activo', true).order('nombre_compania'),
  ]);
  return (
    <>
      <Titulo>Registro de entregas</Titulo>
      {puede(staff, 'staff') && <NuevaEntregaForm clientes={clientes || []} />}
      {error && <Aviso>{error.message}</Aviso>}
      <Tabla
        cols={['Fecha y hora (CT)', 'Cliente', 'Módulo', 'Tipo', 'Período', 'Destinatario', 'Canal', 'Confirmación', 'Monto', 'Por', 'Ubicación', 'Documentos']}
        vacio="Aún no hay entregas registradas."
        rows={(data || []).map((e: any) => [
          <span key="f" className={e.anulada_en ? 'line-through text-[#7FA3C4]' : ''}>{fmtFecha(e.entregado_en)}</span>,
          e.clients?.nombre_compania, e.modulo, e.tipo, e.periodo ?? '—',
          <span key="d">{e.destinatario}{e.destinatario_contacto ? <span className="block text-xs text-[#7FA3C4]">{e.destinatario_contacto}</span> : null}</span>,
          e.canal, e.confirmacion ?? '—', fmtMonto(e.monto), e.entregado_por,
          <span key="u"><DriveLink url={e.drive_folder_url} label="Carpeta" />{e.ubicacion ? <span className="block text-xs text-[#7FA3C4]">{e.ubicacion}</span> : null}</span>,
          <span key="docs" className="flex flex-col gap-1">
            {(e.entrega_documentos || []).map((d: any, i: number) => (
              <DriveLink key={i} url={d.compliance_documents?.drive_url} label={d.compliance_documents?.nombre} />
            ))}
          </span>,
        ])}
      />
    </>
  );
}
