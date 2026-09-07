'use client';

import { useState } from 'react';

export default function SyncClientsButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/sync-clients', { method: 'POST' });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok) throw new Error(data.error || 'Error al sincronizar');
      setMsg(
        `✓ ${data.synced} clientes sincronizados` +
          (data.duplicates ? ` (${data.duplicates} correos repetidos omitidos)` : '')
      );
      // Recarga para mostrar los clientes nuevos.
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-[#7FA3C4]">{msg}</span>}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="rounded-lg border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
      >
        {busy ? 'Sincronizando…' : 'Sincronizar clientes desde Drive'}
      </button>
    </div>
  );
}
