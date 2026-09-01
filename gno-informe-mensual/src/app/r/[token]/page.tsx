import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Props {
  params: { token: string };
}

export default async function ReportPage({ params }: Props) {
  const { data: report } = await supabase
    .from('reports')
    .select('*, clients(*)')
    .eq('magic_token', params.token)
    .gt('magic_token_expires_at', new Date().toISOString())
    .single();

  if (!report) return notFound();

  const client = report.clients as any;

  return (
    <main className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-start py-12 px-4">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8 text-center">
        <img
          src="https://gnotaxservices.com/wp-content/uploads/2024/07/cropped-gno_tax_business_center_logo-removebg-preview.png"
          alt="GNO Tax & Business Center"
          className="h-14 mx-auto mb-3"
        />
        <p className="text-[#7FA3C4] text-xs tracking-widest uppercase">
          Informe Financiero Mensual
        </p>
      </div>

      {/* Video card */}
      <div className="w-full max-w-2xl bg-[#0F2035] border border-[#1E3550] rounded-sm overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-[#1E3550]">
          <h1 className="text-white font-serif text-xl">
            {client.nombre_compania}
          </h1>
          <p className="text-[#7FA3C4] text-sm mt-1">{report.periodo}</p>
        </div>

        {/* HeyGen video embed */}
        <div className="aspect-video w-full bg-black">
          {report.video_url ? (
            <video
              src={report.video_url}
              controls
              autoPlay
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#6B7A8D]">
              Video en procesamiento — disponible pronto
            </div>
          )}
        </div>

        <div className="p-6">
          <p className="text-[#A8BBCC] text-sm mb-6">
            Hola <strong className="text-white">{client.nombre_dueno}</strong>,
            tu informe financiero del periodo <strong className="text-white">{report.periodo}</strong> está listo.
            Mira el video de arriba para el análisis detallado de tu equipo contable.
          </p>

          <a
            href={`https://calendar.app.google/Ljn5wRgfZe9pXbeC7`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center border border-[#C49A2E] text-[#C49A2E] py-3 text-sm font-semibold tracking-wider uppercase hover:bg-[#C49A2E] hover:text-[#0B1F3A] transition-colors"
          >
            Agendar Consulta con tu Contador
          </a>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-[#3D5570] text-xs text-center">
        GNO Tax &amp; Business Center LLC · New Orleans, LA<br />
        Este enlace es personal y expira en 30 días.
      </p>
    </main>
  );
}
