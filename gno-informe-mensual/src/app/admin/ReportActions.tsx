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
  const [script, setScript] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState(defaultPeriodo());
  const [income, setIncome] = useState('');
  const [cogs, setCogs] = useState('');
  const [expenses, setExpenses] = useState('');

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
      const data = await res.json();
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
      const data = await res.json();
      if (res.status === 501) {
        setMsg({
          type: 'info',
          text: 'Falta configurar la narrativa (ANTHROPIC_API_KEY en Vercel).',
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Error al generar el guion');
      setScript(data.script);
      setMsg({ type: 'ok', text: 'Guion generado.' });
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
      const data = await res.json();
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

      {script && (
        <textarea
          readOnly
          value={script}
          rows={6}
          className="mt-2 w-full resize-y rounded border border-white/15 bg-navy px-2 py-1 text-[11px] leading-snug text-[#B9CBDD]"
        />
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
            <button
              type="button"
              onClick={generarGuion}
              disabled={busy}
              className="flex-1 rounded border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
            >
              {busy ? '…' : script ? 'Regenerar guion' : 'Generar guion'}
            </button>
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
            setScript(null);
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
