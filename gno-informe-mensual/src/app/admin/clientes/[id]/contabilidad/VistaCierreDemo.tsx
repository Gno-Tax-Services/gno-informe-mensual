'use client';

import { useState } from 'react';
import type { EntityState, Lang } from '@/lib/entity/types';
import type { DemoScenario } from '@/lib/entity/demo-cases';
import { EQUITY_TEMPLATES, classificationOn, equityCodeRole } from '@/lib/entity/rules';
import { NET_INCOME, closeYear, conversionEntry, personaOrder, reviewAlerts, type ClosingResult, type LedgerLine } from '@/lib/entity/closing';
import { fmtUSD, toCents } from '@/lib/entity/money';
import { issueMessage, t } from '@/lib/entity/i18n';
import { Card, Field, inputCls } from './ui';

function accountLabel(code: string, cls: ReturnType<typeof classificationOn>, state: EntityState, lang: Lang): string {
  if (code === NET_INCOME) return lang === 'es' ? 'Utilidad neta (P&L)' : 'Net income (P&L)';
  const role = equityCodeRole(code);
  // La plantilla vigente primero; si no la tiene (p. ej. 30000 en el asiento de conversión), la de cualquier plantilla.
  const line = role
    ? (cls ? EQUITY_TEMPLATES[cls].find((l) => l.role === role && Number(l.code) <= Number(code)) : null)
      ?? Object.values(EQUITY_TEMPLATES).flat().find((l) => l.role === role && Number(l.code) <= Number(code))
    : null;
  if (!line) return code;
  const base = lang === 'es' ? line.name_es : line.name_en;
  if (!line.per_owner) return base;
  const who = personaOrder(state.owners)[Number(code) - Number(line.code)]?.nombre;
  return who ? `${base} – ${who}` : base;
}

function Lines({ lines, cls, state, lang }: { lines: LedgerLine[]; cls: ReturnType<typeof classificationOn>; state: EntityState; lang: Lang }) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup><col className="w-16" /><col /><col className="w-36" /><col className="w-36" /></colgroup>
      <tbody className="divide-y divide-white/5">
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-3 font-mono text-xs text-[#7FA3C4]">{l.account === NET_INCOME ? '—' : l.account}</td>
            <td className="py-1.5 pr-3">{accountLabel(l.account, cls, state, lang)}</td>
            <td className="py-1.5 text-right font-mono">{l.debit ? fmtUSD(l.debit) : ''}</td>
            <td className="py-1.5 text-right font-mono">{l.credit ? fmtUSD(l.credit) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Vista previa de las reglas de cierre con cifras FICTICIAS (modo demo, casos 2 a 5).
 * Mientras llega el motor de transacciones, muestra cómo cierra cada plantilla, el prorrateo por días,
 * el asiento de conversión y las alertas del revisor.
 */
export default function VistaCierreDemo({ lang, state, scenario }: { lang: Lang; state: EntityState; scenario: DemoScenario }) {
  const [common, setCommon] = useState('');
  const [apic, setApic] = useState('');
  const { year } = scenario;
  const cls = classificationOn(state.classifications, `${year}-12-31`);
  if (!cls || state.owners.length === 0) return null;

  let closing: ClosingResult | null = null;
  try {
    closing = closeYear({
      classification: cls, owners: state.owners, year, fiscalYearEnd: state.profile.fiscal_year_end || '12-31', profitCents: scenario.profitCents,
      openingCapital: scenario.openingCapital, contributions: scenario.contributions, withdrawals: scenario.withdrawals,
    });
  } catch { /* estado a medias: sin vista previa */ }
  if (!closing) return null;

  const alerts = reviewAlerts({
    classification: cls, owners: state.owners, year, fiscalYearEnd: state.profile.fiscal_year_end || '12-31', profitCents: scenario.profitCents,
    openingCapitalTotal: Object.values(scenario.openingCapital).reduce((a, b) => a + b, 0), withdrawals: scenario.withdrawals, closing, payrollCents: scenario.payrollCents,
  });

  const conv = scenario.conversion
    ? conversionEntry({
        to: cls === 'c_corp' ? 'c_corp' : 's_corp',
        fromAccounts: [{ code: '30000', cents: scenario.conversion.capitalCents }],
        commonStockCents: common === '' && apic === '' ? undefined : toCents(common || '0') ?? 0,
        apicCents: common === '' && apic === '' ? undefined : toCents(apic || '0') ?? 0,
      })
    : null;

  const entryTitle = (id: string) => t(lang, `demo.entry.${id}`);
  return (
    <Card title={t(lang, 'demo.title', { year })}>
      <p className="mb-4 text-xs text-[#7FA3C4]">{t(lang, 'demo.note')}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[11px] uppercase text-[#7FA3C4]">{t(lang, 'demo.profit')}</p><p className="font-mono text-lg">{fmtUSD(scenario.profitCents)}</p></div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[11px] uppercase text-[#7FA3C4]">{t(lang, 'demo.withdrawals')}</p><p className="font-mono text-lg">{fmtUSD(Object.values(scenario.withdrawals).reduce((a, b) => a + b, 0))}</p></div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[11px] uppercase text-[#7FA3C4]">{t(lang, 'p4.template_in_force')}</p><p className="py-1 text-base">{t(lang, `class.${cls}`)}</p></div>
      </div>

      {scenario.caseNo === 5 && <p className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#B9CBDD]">{t(lang, 'demo.prorate')}</p>}

      {closing.owners.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-[#7FA3C4]"><tr>
              <th className="px-3 py-2 text-left">{t(lang, 'demo.owner')}</th><th className="px-3 py-2 text-right">{t(lang, 'demo.share')}</th><th className="px-3 py-2 text-right">{t(lang, 'demo.ending')}</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {closing.owners.map((o) => (
                <tr key={o.persona_key}><td className="px-3 py-2">{o.nombre}</td><td className="px-3 py-2 text-right font-mono">{fmtUSD(o.profit)}</td><td className={`px-3 py-2 text-right font-mono ${o.ending < 0 ? 'text-red-300' : ''}`}>{fmtUSD(o.ending)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-4">
        {closing.entries.map((e) => (
          <div key={e.id}>
            <p className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-[#7FA3C4]"><span>{t(lang, 'demo.entry')} · {entryTitle(e.id)}</span><span className="flex w-72 justify-between"><span className="w-36 text-right">{t(lang, 'demo.debit')}</span><span className="w-36 text-right">{t(lang, 'demo.credit')}</span></span></p>
            <Lines lines={e.lines} cls={cls} state={state} lang={lang} />
          </div>
        ))}
      </div>

      {conv && scenario.conversion && (
        <div className="mt-5 rounded-lg border border-gold/30 bg-gold/5 p-4">
          <p className="mb-2 font-medium">{t(lang, 'demo.conv_title', { date: scenario.conversion.date })}</p>
          <p className="mb-3 text-sm text-[#B9CBDD]">{t(lang, 'demo.conv_capital')}: <span className="font-mono">{fmtUSD(scenario.conversion.capitalCents)}</span></p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`${t(lang, 'demo.conv_common')} (USD)`}><input className={`${inputCls} font-mono`} inputMode="decimal" value={common} placeholder="0.00" onChange={(e) => setCommon(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
            <Field label={`${t(lang, 'demo.conv_apic')} (USD)`}><input className={`${inputCls} font-mono`} inputMode="decimal" value={apic} placeholder="0.00" onChange={(e) => setApic(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
          </div>
          {conv.status === 'ready'
            ? <div className="mt-3"><p className="mb-1 text-sm text-green-300">✓ {t(lang, 'demo.conv_ready')}</p><Lines lines={conv.lines} cls={cls} state={state} lang={lang} /></div>
            : <p className="mt-3 text-sm text-gold" aria-live="polite">{t(lang, 'demo.conv_pending', { amount: fmtUSD(conv.unallocatedCents) })}</p>}
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-[#7FA3C4]">{t(lang, 'demo.alerts')}</p>
        {alerts.length === 0 ? <p className="text-sm text-[#7FA3C4]">{t(lang, 'demo.no_alerts')}</p> : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${a.severity === 'error' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-gold/40 bg-gold/10 text-gold'}`}>
                {issueMessage(lang, { code: a.code, detail: a.detail })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
