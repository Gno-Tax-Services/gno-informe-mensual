'use client';

import { useEffect, useState } from 'react';

/**
 * Muestra •••-••-1234. Si el usuario es admin puede "Ver" el número completo:
 * pide motivo, lo muestra 30 segundos y lo vuelve a ocultar. No lo copia al
 * portapapeles ni lo guarda en el navegador.
 */
export default function IdentificadorEnmascarado(
  { id, tipo, last4, puedeRevelar }: { id: string; tipo: string; last4: string; puedeRevelar: boolean },
) {
  const mascara = tipo === 'EIN' ? `••-•••${last4}` : `•••-••-${last4}`;
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valor) return;
    const t = setTimeout(() => setValor(null), 30_000);
    const ocultar = () => setValor(null);
    document.addEventListener('visibilitychange', ocultar);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', ocultar); };
  }, [valor]);

  async function revelar() {
    const motivo = window.prompt(`Motivo para ver el ${tipo} completo (queda registrado):`);
    if (!motivo) return;
    setError(null);
    const res = await fetch(`/api/compliance/identificadores/${id}/revelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error || 'No autorizado'); return; }
    setValor(j.valor);
  }

  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm">
      <span className="text-[#7FA3C4]">{tipo}</span>
      <span className="select-none">{valor ?? mascara}</span>
      {puedeRevelar && !valor && (
        <button onClick={revelar} className="rounded border border-white/20 px-2 py-0.5 text-xs text-gold">Ver</button>
      )}
      {valor && <button onClick={() => setValor(null)} className="text-xs text-[#7FA3C4]">Ocultar</button>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
