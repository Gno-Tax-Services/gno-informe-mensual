'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type BatchStatus = {
  summary: {
    total_clients: number;
    active_clients: number;
    emails_sent: number;
    emails_opened: number;
    sms_sent: number;
    open_rate: string;
  };
  reports_by_periodo: Record<string, {
    total: number;
    draft: number;
    ready: number;
    sent: number;
    video_pending: number;
    video_processing: number;
    video_ready: number;
    video_error: number;
  }>;
  clients: Array<{
    compania: string;
    email_sent: boolean;
    email_opened: boolean;
    sms_sent: boolean;
    reports: number;
  }>;
};

type ActionResult = {
  action?: string;
  periodo?: string;
  avatar?: string;
  total?: number;
  results?: Array<{ client: string; status: string; error?: string }>;
  checked?: number;
  sent?: number;
  errors?: number;
  details?: Array<{ client: string; status: string; error?: string }>;
  message?: string;
  error?: string;
};

export default function BatchControlPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Cargando...</div>}>
      <BatchControlInner />
    </Suspense>
  );
}

function BatchControlInner() {
  const searchParams = useSearchParams();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const k = searchParams.get('key');
    if (k) {
      setKey(k);
      fetchStatus(k);
    }
  }, [searchParams]);

  async function fetchStatus(secret?: string) {
    const s = secret || key;
    if (!s) { setError('Ingresa el BATCH_SECRET'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/batch/status?periodo=September 2026', {
        headers: { Authorization: `Bearer ${s}` },
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Clave incorrecta' : `Error ${res.status}`);
      setStatus(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(endpoint: string, method: string, label: string) {
    if (!key) { setError('Ingresa el BATCH_SECRET'); return; }
    setActionLoading(label);
    setActionResult(null);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setActionResult(data);
      setTimeout(() => fetchStatus(), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  const periodo = 'September 2026';
  const reportData = status?.reports_by_periodo?.[periodo];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px' }}>
        Control de Batch — Septiembre 2026
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 24px' }}>
        GNO Tax & Business Center — Panel de control para generar videos y enviar emails
      </p>

      {!status && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="password"
            placeholder="BATCH_SECRET"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchStatus()}
            style={{
              flex: 1, minWidth: 200, padding: '10px 14px',
              border: '1px solid #d1d5db', borderRadius: 8,
              fontSize: '0.875rem',
            }}
          />
          <button
            onClick={() => fetchStatus()}
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

      {status && (
        <>
          {/* Status KPIs */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12, marginBottom: 24,
          }}>
            {[
              { value: status.summary.active_clients, label: 'Clientes Activos', color: '#111827' },
              { value: reportData?.total ?? 0, label: 'Reportes Sept', color: reportData?.total ? '#16a34a' : '#dc2626' },
              { value: reportData?.video_ready ?? 0, label: 'Videos Listos', color: '#16a34a' },
              { value: reportData?.video_processing ?? 0, label: 'Videos en Proceso', color: '#d97706' },
              { value: reportData?.video_error ?? 0, label: 'Videos Error', color: '#dc2626' },
              { value: reportData?.sent ?? 0, label: 'Emails Enviados', color: '#1d4ed8' },
              { value: reportData?.draft ?? 0, label: 'Borradores', color: '#6b7280' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
                padding: 14, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12,
            padding: 20, marginBottom: 24,
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 8px', color: '#0c4a6e' }}>
              Acciones del Batch
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#0369a1', margin: '0 0 16px' }}>
              {!reportData?.total
                ? 'No hay reportes para Septiembre 2026. Haz clic en "Paso 1" para generar los videos.'
                : reportData.video_processing > 0
                  ? `Hay ${reportData.video_processing} video(s) procesándose. Haz clic en "Paso 2" para verificar y enviar emails.`
                  : reportData.draft > 0
                    ? `Hay ${reportData.draft} reporte(s) listos para enviar. Haz clic en "Paso 2" para enviar los emails.`
                    : reportData.sent > 0
                      ? `Se han enviado ${reportData.sent} email(s) exitosamente.`
                      : 'Verifica el estado y procede según corresponda.'
              }
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => runAction('/api/batch/start', 'POST', 'Generando videos...')}
                disabled={!!actionLoading}
                style={{
                  padding: '12px 24px', border: 'none', borderRadius: 8,
                  background: '#16a34a', color: 'white', fontWeight: 700,
                  fontSize: '0.9rem', cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                  flex: '1 1 200px',
                }}
              >
                {actionLoading === 'Generando videos...' ? 'Generando videos...' : 'Paso 1: Generar Videos'}
              </button>

              <button
                onClick={() => runAction('/api/batch/poll', 'POST', 'Verificando y enviando...')}
                disabled={!!actionLoading}
                style={{
                  padding: '12px 24px', border: 'none', borderRadius: 8,
                  background: '#1d4ed8', color: 'white', fontWeight: 700,
                  fontSize: '0.9rem', cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                  flex: '1 1 200px',
                }}
              >
                {actionLoading === 'Verificando y enviando...' ? 'Verificando y enviando...' : 'Paso 2: Verificar Videos y Enviar Emails'}
              </button>

              <button
                onClick={() => fetchStatus()}
                disabled={loading || !!actionLoading}
                style={{
                  padding: '12px 24px', border: '2px solid #d1d5db', borderRadius: 8,
                  background: 'white', color: '#374151', fontWeight: 600,
                  fontSize: '0.9rem', cursor: (loading || actionLoading) ? 'not-allowed' : 'pointer',
                  opacity: (loading || actionLoading) ? 0.6 : 1,
                }}
              >
                Actualizar Estado
              </button>
            </div>
          </div>

          {/* Action Result */}
          {actionResult && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
              padding: 16, marginBottom: 24,
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#166534', margin: '0 0 8px' }}>
                Resultado
              </h3>
              {actionResult.periodo && (
                <p style={{ fontSize: '0.8rem', color: '#15803d', margin: '0 0 4px' }}>
                  Periodo: {actionResult.periodo}
                  {actionResult.avatar && ` | Avatar: ${actionResult.avatar}`}
                  {actionResult.total != null && ` | Clientes: ${actionResult.total}`}
                </p>
              )}
              {actionResult.message && (
                <p style={{ fontSize: '0.8rem', color: '#15803d', margin: '0 0 4px' }}>
                  {actionResult.message}
                </p>
              )}
              {actionResult.checked != null && (
                <p style={{ fontSize: '0.8rem', color: '#15803d', margin: '0 0 4px' }}>
                  Verificados: {actionResult.checked} | Enviados: {actionResult.sent} | Errores: {actionResult.errors}
                </p>
              )}

              {/* Results table */}
              {(actionResult.results || actionResult.details) && (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{
                    width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem',
                    background: 'white', borderRadius: 8, overflow: 'hidden',
                  }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Cliente</th>
                        <th style={thStyle}>Estado</th>
                        <th style={thStyle}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(actionResult.results || actionResult.details || []).map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={tdStyle}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>{r.client}</td>
                          <td style={tdStyle}>
                            <StatusBadge status={r.status} />
                          </td>
                          <td style={{ ...tdStyle, color: '#dc2626', fontSize: '0.75rem' }}>
                            {r.error || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Clients without reports */}
          {status.clients && (
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px', color: '#374151' }}>
                Clientes sin reporte de Sept 2026
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem',
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Compania</th>
                      <th style={thStyle}>Reportes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.clients
                      .filter(c => c.reports === 0)
                      .map((c, i) => (
                        <tr key={c.compania} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={tdStyle}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>{c.compania}</td>
                          <td style={tdStyle}>{c.reports}</td>
                        </tr>
                      ))}
                    {status.clients.filter(c => c.reports === 0).length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#16a34a', padding: 24 }}>
                          Todos los clientes tienen reportes generados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 16, textAlign: 'center' }}>
            Ultima consulta: {new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' })}
          </p>
        </>
      )}

      {/* Instructions */}
      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
        padding: 16, marginTop: 24,
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e', margin: '0 0 8px' }}>
          Instrucciones
        </h3>
        <ol style={{ fontSize: '0.8rem', color: '#78350f', margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Paso 1 — Generar Videos:</strong> Lee los P&L de Google Drive, crea los reportes, genera los guiones con IA, y manda los videos a HeyGen. Toma unos minutos.</li>
          <li><strong>Espera 5-10 minutos</strong> para que HeyGen procese los videos.</li>
          <li><strong>Paso 2 — Verificar y Enviar:</strong> Revisa si los videos estan listos en HeyGen. Si es dia 26+, envia los emails automaticamente.</li>
          <li>Puedes hacer clic en <strong>Actualizar Estado</strong> en cualquier momento para ver el progreso.</li>
          <li>Si algun video tiene error, puedes correr Paso 1 de nuevo — solo procesa los que faltan.</li>
        </ol>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6b7280',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
};

function StatusBadge({ status }: { status: string }) {
  let bg = '#f3f4f6';
  let color = '#6b7280';

  if (status.includes('processing') || status.includes('proceso')) {
    bg = '#fffbeb'; color = '#d97706';
  } else if (status.includes('sent') || status.includes('enviado') || status.includes('ready')) {
    bg = '#f0fdf4'; color = '#16a34a';
  } else if (status.includes('error') || status.includes('failed')) {
    bg = '#fef2f2'; color = '#dc2626';
  } else if (status.includes('skipped') || status.includes('excluded')) {
    bg = '#f0f9ff'; color = '#0284c7';
  } else if (status.includes('held')) {
    bg = '#faf5ff'; color = '#7c3aed';
  }

  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 600, background: bg, color,
    }}>
      {status}
    </span>
  );
}
