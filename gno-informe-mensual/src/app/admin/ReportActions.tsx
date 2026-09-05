'use client';

import { useState } from 'react';

type Report = {
  id: string;
  periodo: string;
  net_income: number | null;
  profit_margin: number | null;
  status: string;
};

// Periodo por defecto: mes anterior en formato "Mes AAAA" (es-ES).
function defaultPeriodo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const mes = d.toLocaleDateString('es-ES', { month: 'long' });
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${d.getFullYear()}`;
}

export default function ReportActions({
  clientId,
  compania,
}: {
  clientId: string;
  compania: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(
    null
  );
  const [report, setReport] = useState<Report | null>(null);
  const [script, setScript] = useState('');
  const [scriptSaved, setScriptSaved] = useState(false);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>(
    'idle'
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState(defaultPeriodo());
  const [income, setIncome] = useState('');
  const [cogs, setCogs] = useState('');
  const [expenses, setExpenses] = useState('');
  const [mesLabel, setMesLabel] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Importa el P&L (PDF) del cliente desde Google Drive y rellena los montos.
  async function importarDrive() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/import-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: compania, monthLabel: mesLabel, periodo }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.status === 501) {
        setMsg({ type: 'info', text: data.error || 'Falta configurar Drive/Anthropic.' });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Error importando de Drive');
      if (data.totalIncome != null) setIncome(String(data.totalIncome));
      if (data.totalCogs != null) setCogs(String(data.totalCogs));
      if (data.totalExpenses != null) setExpenses(String(data.totalExpenses));
      setMsg({
        type: 'ok',
        text: `Importado de ${data.source}: Ingresos $${Number(
          data.totalIncome
        ).toLocaleString()}, Utilidad neta $${Number(data.netIncome).toLocaleString()}. Revisa y crea el informe.`,
      });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function crearInforme() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          periodo,
          totalIncome: income,
          totalCogs: cogs,
          totalExpenses: expenses,
        }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok) throw new Error(data.error || 'Error al crear el informe');
      setReport(data.report);
      setMsg({
        type: 'ok',
        text: `Informe ${data.report.periodo} creado (Net: $${Number(
          data.report.net_income
        ).toLocaleString()}, Margen: ${data.report.profit_margin}%).`,
      });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function generarGuion() {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/reports/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.status === 501) {
        setMsg({
          type: 'info',
          text: 'Falta configurar la narrativa (ANTHROPIC_API_KEY en Vercel).',
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Error al generar el guion');
      setScript(data.script);
      setScriptSaved(true);
      setMsg({ type: 'ok', text: 'Guion generado y guardado.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function guardarGuion() {
    if (!report || !script.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/reports/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, script }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok) throw new Error(data.error || 'Error al guardar el guion');
      setScriptSaved(true);
      setMsg({ type: 'ok', text: 'Guion guardado.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function generarVideo() {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/reports/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.status === 501) {
        setMsg({ type: 'info', text: 'Falta configurar HeyGen (HEYGEN_API_KEY en Vercel).' });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Error al generar el video');
      setVideoStatus('processing');
      setMsg({ type: 'info', text: 'Video en proceso en HeyGen (puede tardar unos minutos).' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function actualizarVideo() {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/reports/video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok) throw new Error(data.error || 'Error al consultar el estado');
      setVideoStatus(data.status);
      if (data.status === 'ready' && data.url) {
        setVideoUrl(data.url);
        setMsg({ type: 'ok', text: '¡Video listo!' });
      } else if (data.status === 'error') {
        setMsg({ type: 'err', text: data.error || 'El video falló en HeyGen.' });
      } else {
        setMsg({ type: 'info', text: 'Todavía en proceso…' });
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function enviarInforme() {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, reportId: report.id }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.status === 501) {
        setMsg({
          type: 'info',
          text: 'Informe listo, pero falta configurar el envío de Gmail (GMAIL_SENDER_REFRESH_TOKEN).',
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setMsg({ type: 'ok', text: '¡Informe enviado por email!' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gold/50 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10"
      >
        Generar informe
      </button>
    );
  }

  return (
    <div className="mt-1 w-72 rounded-lg border border-white/10 bg-navy/60 p-3 text-left">
      <div className="mb-2 text-xs font-medium text-white">{compania}</div>

      <label className="mb-2 block">
        <span className="text-[10px] uppercase tracking-wide text-[#7FA3C4]">Periodo</span>
        <input
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="mt-0.5 w-full rounded border border-white/15 bg-navy px-2 py-1 text-xs text-white"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Ingresos" value={income} onChange={setIncome} />
        <NumberField label="COGS" value={cogs} onChange={setCogs} />
        <NumberField label="Gastos" value={expenses} onChange={setExpenses} />
      </div>

      {!report && (
        <div className="mt-2 flex items-end gap-2">
          <label className="flex-1">
            <span className="text-[10px] uppercase tracking-wide text-[#7FA3C4]">
              Mes en Drive
            </span>
            <input
              value={mesLabel}
              onChange={(e) => setMesLabel(e.target.value)}
              placeholder="2026-09"
              className="mt-0.5 w-full rounded border border-white/15 bg-navy px-2 py-1 text-xs text-white"
            />
          </label>
          <button
            type="button"
            onClick={importarDrive}
            disabled={busy}
            title="Lee el P&L (PDF) del cliente desde Google Drive y rellena los montos"
            className="rounded border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
          >
            {busy ? '…' : 'Importar de Drive'}
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`mt-2 rounded px-2 py-1 text-[11px] ${
            msg.type === 'ok'
              ? 'bg-green-500/15 text-green-300'
              : msg.type === 'info'
                ? 'bg-gold/15 text-gold'
                : 'bg-red-500/15 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      {report && (
        <label className="mt-2 block">
          <span className="text-[10px] uppercase tracking-wide text-[#7FA3C4]">
            Guion (escríbelo o genéralo con IA)
          </span>
          <textarea
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              setScriptSaved(false);
            }}
            rows={6}
            placeholder="Escribe aquí el guion del video, o usa 'Generar guion' si tienes ANTHROPIC_API_KEY…"
            className="mt-0.5 w-full resize-y rounded border border-white/15 bg-navy px-2 py-1 text-[11px] leading-snug text-white"
          />
          {script.trim() && !scriptSaved && (
            <span className="text-[10px] text-gold">Cambios sin guardar</span>
          )}
        </label>
      )}

      {videoStatus !== 'idle' && (
        <div className="mt-2 flex items-center justify-between rounded border border-white/10 bg-navy px-2 py-1 text-[11px]">
          <span className="text-[#7FA3C4]">
            Video:{' '}
            <span
              className={
                videoStatus === 'ready'
                  ? 'text-green-300'
                  : videoStatus === 'error'
                    ? 'text-red-300'
                    : 'text-gold'
              }
            >
              {videoStatus === 'ready'
                ? 'listo'
                : videoStatus === 'error'
                  ? 'error'
                  : 'en proceso'}
            </span>
          </span>
          {videoStatus === 'ready' && videoUrl ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline"
            >
              Ver video
            </a>
          ) : videoStatus === 'processing' ? (
            <button
              type="button"
              onClick={actualizarVideo}
              disabled={busy}
              className="text-gold underline disabled:opacity-60"
            >
              Actualizar estado
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!report ? (
          <button
            type="button"
            onClick={crearInforme}
            disabled={busy}
            className="flex-1 rounded bg-gold px-3 py-1.5 text-xs font-medium text-navy transition hover:bg-gold/90 disabled:opacity-60"
          >
            {busy ? 'Creando…' : 'Crear informe'}
          </button>
        ) : (
          <>
            {script.trim() && !scriptSaved && (
              <button
                type="button"
                onClick={guardarGuion}
                disabled={busy}
                className="flex-1 rounded bg-gold px-3 py-1.5 text-xs font-medium text-navy transition hover:bg-gold/90 disabled:opacity-60"
              >
                {busy ? '…' : 'Guardar guion'}
              </button>
            )}
            <button
              type="button"
              onClick={generarGuion}
              disabled={busy}
              className="flex-1 rounded border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
            >
              {busy ? '…' : script.trim() ? 'Regenerar con IA' : 'Generar con IA'}
            </button>
            {scriptSaved && videoStatus === 'idle' && (
              <button
                type="button"
                onClick={generarVideo}
                disabled={busy}
                className="flex-1 rounded border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
              >
                {busy ? '…' : 'Generar video'}
              </button>
            )}
            <button
              type="button"
              onClick={enviarInforme}
              disabled={busy}
              className="flex-1 rounded bg-gold px-3 py-1.5 text-xs font-medium text-navy transition hover:bg-gold/90 disabled:opacity-60"
            >
              {busy ? '…' : 'Enviar por email'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReport(null);
            setScript('');
            setScriptSaved(false);
            setVideoStatus('idle');
            setVideoUrl(null);
            setMsg(null);
          }}
          className="rounded border border-white/15 px-2 py-1.5 text-xs text-[#7FA3C4] hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-[#7FA3C4]">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="mt-0.5 w-full rounded border border-white/15 bg-navy px-2 py-1 text-xs text-white"
      />
    </label>
  );
}
