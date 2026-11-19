'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MODULOS = [['audit', 'Auditoría'], ['sales_tax', 'Sales tax'], ['payroll', 'Nómina'], ['informe', 'Informe mensual'], ['otro', 'Otro']];
const CANALES = [['email', 'Email'], ['portal', 'Portal'], ['correo', 'Correo postal'], ['fax', 'Fax'], ['sms', 'SMS'], ['en_persona', 'En persona'], ['otro', 'Otro']];

const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function NuevaEntregaForm({ clientes }: { clientes: { id: string; nombre_compania: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setEnviando(true);
    setError(null);
    const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>;
    const body = {
      ...f,
      entregado_en: new Date(f.entregado_en).toISOString(),
      monto: f.monto ? Number(f.monto) : null,
      drive_folder_url: f.drive_folder_url || null,
    };
    const res = await fetch('/api/compliance/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEnviando(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || 'No se pudo guardar');
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  const input = 'w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm';
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="mb-4 rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy">
        + Registrar entrega
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-3">
      <label className="text-xs text-[#7FA3C4]">Cliente
        <select name="client_id" required className={input}>
          <option value="">—</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_compania}</option>)}
        </select>
      </label>
      <label className="text-xs text-[#7FA3C4]">Módulo
        <select name="modulo" required className={input}>{MODULOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="text-xs text-[#7FA3C4]">Tipo
        <input name="tipo" required placeholder="WC audit, R-1029, 941…" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Período
        <input name="periodo" placeholder="2026-10 / 2026-Q3 / 2025-10-24/2026-10-24" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Destinatario
        <input name="destinatario" required placeholder="Pie Casualty, LDR, IRS, cliente…" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Contacto
        <input name="destinatario_contacto" placeholder="correo o portal" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Canal
        <select name="canal" required className={input}>{CANALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="text-xs text-[#7FA3C4]">Fecha y hora de entrega
        <input name="entregado_en" type="datetime-local" required defaultValue={ahoraLocal()} className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Confirmación
        <input name="confirmacion" placeholder="n.º de confirmación" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4]">Monto pagado
        <input name="monto" type="number" step="0.01" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4] sm:col-span-2">Carpeta en Drive (link)
        <input name="drive_folder_url" type="url" placeholder="https://drive.google.com/drive/folders/…" className={input} />
      </label>
      <label className="text-xs text-[#7FA3C4] sm:col-span-3">Notas
        <input name="notas" className={input} />
      </label>
      {error && <p className="text-sm text-red-300 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button disabled={enviando} className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar entrega'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-md border border-white/20 px-4 py-2 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
