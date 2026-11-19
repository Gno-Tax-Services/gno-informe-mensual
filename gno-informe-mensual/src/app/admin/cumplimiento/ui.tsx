import Link from 'next/link';
import type { ReactNode } from 'react';

export const fmtFecha = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-US', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const fmtMonto = (n?: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function Tabla({ cols, rows, vacio }: { cols: string[]; rows: ReactNode[][]; vacio: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-[#7FA3C4]">
          <tr>{cols.map((c) => <th key={c} className="px-4 py-3 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-[#7FA3C4]">{vacio}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/5">
                {r.map((c, j) => <td key={j} className="px-4 py-3 align-top">{c}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DriveLink({ url, label = 'Drive' }: { url?: string | null; label?: string }) {
  if (!url) return <span className="text-[#7FA3C4]">—</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-gold underline">{label}</a>;
}

export function Estado({ v }: { v: string }) {
  const verde = ['sent', 'filed', 'paid', 'closed'].includes(v);
  const ambar = ['review', 'in_progress', 'pending_docs', 'pending'].includes(v);
  const c = verde ? 'bg-green-500/15 text-green-300' : ambar ? 'bg-gold/15 text-gold' : 'bg-white/10 text-white';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${c}`}>{v}</span>;
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-serif text-xl">{children}</h2>
      {accion}
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{children}</div>;
}

export { Link };
