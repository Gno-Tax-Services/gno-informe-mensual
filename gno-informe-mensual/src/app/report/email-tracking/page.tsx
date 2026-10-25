'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type ClientRow = {
  compania: string;
  email_sent: boolean;
  email_opened: boolean;
  sms_sent: boolean;
  reports: number;
};

type StatusData = {
  summary: {
    total_clients: number;
    active_clients: number;
    emails_sent: number;
    emails_opened: number;
    sms_sent: number;
    open_rate: string;
  };
  clients: ClientRow[];
};

export default function EmailTrackingReport() {
  const searchParams = useSearchParams();
  const [key, setKey] = useState('');
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'no-open' | 'no-email'>('no-open');
  const [sortDir, setSortDir] = useState(true);

  useEffect(() => {
    const k = searchParams.get('key');
    if (k) {
      setKey(k);
      fetchData(k);
    }
  }, [searchParams]);

  async function fetchData(secret?: string) {
    const s = secret || key;
    if (!s) { setError('Ingresa el BATCH_SECRET'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/batch/status', {
        headers: { Authorization: `Bearer ${s}` },
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Clave incorrecta' : `Error ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const clients = data?.clients || [];
  const emailSent = clients.filter(c => c.email_sent);
  const noOpeners = emailSent.filter(c => !c.email_opened);
  const openers = emailSent.filter(c => c.email_opened);
  const noEmail = clients.filter(c => !c.email_sent);

  const filtered =
    filter === 'no-open' ? noOpeners :
    filter === 'no-email' ? noEmail :
    clients;

  const sorted = [...filtered].sort((a, b) => {
    const cmp = a.compania.localeCompare(b.compania, 'es');
    return sortDir ? cmp : -cmp;
  });

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px' }}>
        Email Tracking — No Abrieron
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 24px' }}>
        GNO Tax & Business Center — Reporte diario de seguimiento
      </p>

      {!data && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="password"
            placeholder="BATCH_SECRET"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchData()}
            style={{
              flex: 1, minWidth: 200, padding: '10px 14px',
              border: '1px solid #d1d5db', borderRadius: 8,
              fontSize: '0.875rem',
            }}
          />
          <button
            onClick={() => fetchData()}
            disabled={loading}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: '#1d4ed8', color: 'white', fontWeight: 600,
              fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Cargando...' : 'Consultar'}
          </button>
        </div>
      )}

      {error && (
        <div style={{
          background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
          borderRadius: 8, marginBottom: 16, fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12, marginBottom: 24,
          }}>
            {[
              { value: clients.length, label: 'Clientes Activos', color: '#111827' },
              { value: emailSent.length, label: 'Emails Enviados', color: '#111827' },
              { value: openers.length, label: 'Abrieron', color: '#16a34a' },
              { value: noOpeners.length, label: 'No Abrieron', color: '#dc2626' },
              { value: noEmail.length, label: 'Sin Email', color: '#d97706' },
              { value: data.summary.open_rate, label: 'Tasa Apertura', color: '#1d4ed8' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
                padding: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
              }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'no-open' as const, label: `No Abrieron (${noOpeners.length})`, color: '#dc2626', bg: '#fef2f2' },
              { id: 'no-email' as const, label: `Sin Email (${noEmail.length})`, color: '#d97706', bg: '#fffbeb' },
              { id: 'all' as const, label: `Todos (${clients.length})`, color: '#1d4ed8', bg: '#eff6ff' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 14px', border: `1.5px solid ${filter === f.id ? f.color : '#d1d5db'}`,
                  borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                  background: filter === f.id ? f.bg : 'white',
                  color: filter === f.id ? f.color : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}

            <button
              onClick={() => fetchData()}
              style={{
                marginLeft: 'auto', padding: '6px 14px', border: '1px solid #d1d5db',
                borderRadius: 20, fontSize: '0.8rem', background: 'white',
                cursor: 'pointer', color: '#6b7280',
              }}
            >
              Actualizar
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', background: 'white',
              border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)', fontSize: '0.875rem',
            }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => setSortDir(!sortDir)}>
                    Compañía {sortDir ? '↑' : '↓'}
                  </th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Abrió</th>
                  <th style={thStyle}>SMS</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.compania} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.compania}</td>
                    <td style={tdStyle}>
                      <Badge ok={c.email_sent} yes="Enviado" no="No" />
                    </td>
                    <td style={tdStyle}>
                      {c.email_sent
                        ? <Badge ok={c.email_opened} yes="Sí" no="No abrió" dangerIfNo />
                        : <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      <Badge ok={c.sms_sent} yes="Sí" no="No" />
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                      {filter === 'no-open' ? 'Todos abrieron su email' : 'Sin datos'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 16, textAlign: 'center' }}>
            Última consulta: {new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' })}
          </p>
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontWeight: 600,
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6b7280',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 14px',
};

function Badge({ ok, yes, no, dangerIfNo }: { ok: boolean; yes: string; no: string; dangerIfNo?: boolean }) {
  const green = { background: '#f0fdf4', color: '#16a34a' };
  const red = { background: '#fef2f2', color: '#dc2626' };
  const gray = { background: '#f3f4f6', color: '#6b7280' };
  const s = ok ? green : dangerIfNo ? red : gray;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 600, ...s,
    }}>
      {ok ? yes : no}
    </span>
  );
}
