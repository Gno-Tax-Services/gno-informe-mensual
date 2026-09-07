import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import SignOutButton from './SignOutButton';
import ReportActions from './ReportActions';
import SyncClientsButton from './SyncClientsButton';

// Siempre dinámico: depende de la sesión (cookies).
export const dynamic = 'force-dynamic';

type Client = {
  id: string;
  nombre_dueno: string;
  nombre_compania: string;
  email: string;
  telefono: string | null;
  idioma: string | null;
  activo: boolean;
  primer_email_enviado: boolean;
};

// Lee la lista de clientes con la service role key (bypassa RLS, solo server).
async function getClients(): Promise<{ clients: Client[]; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { clients: [], error: 'Supabase no está configurado.' };
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('clients')
    .select('id, nombre_dueno, nombre_compania, email, telefono, idioma, activo, primer_email_enviado')
    .order('nombre_compania', { ascending: true });

  if (error) {
    return { clients: [], error: error.message };
  }
  return { clients: (data as Client[]) ?? [], error: null };
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { clients, error } = await getClients();
  const totalActivos = clients.filter((c) => c.activo).length;
  const totalEnviados = clients.filter((c) => c.primer_email_enviado).length;

  return (
    <main className="min-h-screen bg-navy text-white">
      {/* Encabezado */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gno-logo.png"
              alt="GNO"
              className="h-10 w-10 object-contain"
            />
            <div>
              <h1 className="font-serif text-lg leading-tight">Informe Mensual</h1>
              <p className="text-xs text-[#7FA3C4]">Panel de administración</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[#7FA3C4] sm:inline">
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* KPIs */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Clientes" value={clients.length} />
          <Kpi label="Activos" value={totalActivos} />
          <Kpi label="Con 1er email enviado" value={totalEnviados} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">Clientes</h2>
          <SyncClientsButton />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            No se pudieron cargar los clientes: {error}
          </div>
        )}

        {/* Tabla de clientes */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-[#7FA3C4]">
              <tr>
                <th className="px-4 py-3 font-medium">Compañía</th>
                <th className="px-4 py-3 font-medium">Dueño</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Idioma</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {clients.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#7FA3C4]">
                    No hay clientes registrados todavía.
                  </td>
                </tr>
              )}
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{c.nombre_compania}</td>
                  <td className="px-4 py-3 text-[#B9CBDD]">{c.nombre_dueno}</td>
                  <td className="px-4 py-3 text-[#B9CBDD]">{c.email}</td>
                  <td className="px-4 py-3 text-[#B9CBDD]">{c.idioma || '—'}</td>
                  <td className="px-4 py-3 text-[#B9CBDD]">{c.telefono || '—'}</td>
                  <td className="px-4 py-3">
                    {c.activo ? (
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-300">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#7FA3C4]">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <div className="flex justify-end">
                      <ReportActions clientId={c.id} compania={c.nombre_compania} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[#7FA3C4]">
          "Generar informe" crea el reporte del mes con sus métricas. El envío por
          email requiere configurar <code className="text-gold">GMAIL_SENDER_REFRESH_TOKEN</code>;
          el video HeyGen y la narrativa se agregan en el siguiente paso.
        </p>
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="font-serif text-3xl text-gold">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-[#7FA3C4]">
        {label}
      </div>
    </div>
  );
}
