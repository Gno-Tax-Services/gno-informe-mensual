'use client';

import { BALANCE_SOURCES, type BalanceSource } from '@/lib/entity/types';
import { EQUITY_TEMPLATES, balanceCheck, classificationOn, equityCodeRole } from '@/lib/entity/rules';
import { personaOrder } from '@/lib/entity/closing';
import { fmtUSD } from '@/lib/entity/money';
import { t } from '@/lib/entity/i18n';
import type { Lang } from '@/lib/entity/types';
import { Card, Field, btnGhost, btnTiny, inputCls, newKey, type StepProps } from './ui';

/** Nombre de una cuenta de equity según la plantilla vigente a la fecha de corte. */
export function equityLabel(code: string, cls: ReturnType<typeof classificationOn>, lang: Lang): string | null {
  const role = equityCodeRole(code);
  if (!role) return null;
  if (role === 'opening_balance_equity') return 'Opening Balance Equity';
  const line = cls ? EQUITY_TEMPLATES[cls].find((l) => l.role === role) : null;
  return line ? (lang === 'es' ? line.name_es : line.name_en) : null;
}

const nextCode = (base: number, rows: { account_code: string }[]) => {
  const used = new Set(rows.map((r) => r.account_code));
  let c = base;
  while (used.has(String(c))) c += 1;
  return String(c);
};

/** Paso 4 — saldos iniciales con cuadre en vivo: activos − pasivos − capital = 0. */
export default function PasoSaldos({ lang, state, setState, disabled, msg }: StepProps) {
  const people = personaOrder(state.owners);
  const cls = state.as_of ? classificationOn(state.classifications, state.as_of) : null;
  const bc = balanceCheck(state.balances);

  const patch = (key: string, p: Record<string, unknown>) =>
    setState((s) => ({ ...s, balances: s.balances.map((b) => (b.key === key ? { ...b, ...p } : b)) }));
  const remove = (key: string) => setState((s) => ({ ...s, balances: s.balances.filter((b) => b.key !== key) }));
  const defaultAsOf = (s: typeof state) => s.as_of || `${new Date().getFullYear() - 1}-12-31`;
  const addRow = (base: number) =>
    setState((s) => ({
      ...s, as_of: defaultAsOf(s),
      balances: [...s.balances, { key: newKey(), account_code: nextCode(base, s.balances), account_name: '', persona_key: null, amount: '', source: 'GNO' }],
    }));

  /** Capital por dueño según la plantilla vigente (no se acepta un solo total en partnership/S-corp). */
  const addCapital = () =>
    setState((s) => {
      const as_of = defaultAsOf(s);
      const c = classificationOn(s.classifications, as_of);
      const owners = personaOrder(s.owners);
      const have = new Set(s.balances.map((b) => `${b.account_code}|${b.persona_key ?? ''}`));
      const want: { code: string; persona_key: string | null }[] = [];
      if (c === 'partnership') owners.forEach((o, n) => want.push({ code: String(30100 + n), persona_key: o.persona_key }));
      else if (c === 's_corp') owners.forEach((o) => want.push({ code: '31000', persona_key: o.persona_key }));
      else if (c === 'disregarded') want.push({ code: '30000', persona_key: owners[0]?.persona_key ?? null });
      else if (c === 'c_corp') want.push({ code: '31000', persona_key: null });
      if (c === 's_corp' || c === 'c_corp') want.push({ code: '32000', persona_key: null });
      const rows = want.filter((w) => !have.has(`${w.code}|${w.persona_key ?? ''}`))
        .map((w) => ({ key: newKey(), account_code: w.code, account_name: '', persona_key: w.persona_key, amount: '', source: 'GNO' as BalanceSource }));
      return { ...s, as_of, balances: [...s.balances, ...rows] };
    });

  const stat = (label: string, cents: number, tone = '') => (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-[#7FA3C4]">{label}</p>
      <p className={`font-mono text-lg ${tone}`}>{fmtUSD(cents)}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t(lang, 'p4.as_of')} error={msg('as_of')}>
            <input data-ref="as_of" type="date" aria-invalid={!!msg('as_of')} className={inputCls} disabled={disabled} value={state.as_of}
              onChange={(e) => setState((s) => ({ ...s, as_of: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <p className="text-xs text-[#7FA3C4]">{t(lang, 'p4.template_in_force')}</p>
            <p className="mt-2 text-sm">{cls ? t(lang, `class.${cls}`) : '—'}</p>
            {(cls === 'partnership' || cls === 's_corp') && <p className="mt-1 text-xs text-gold">{t(lang, 'p4.capital_by_owner')}</p>}
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[#7FA3C4]">
            <tr>{['p4.code', 'p4.name', 'p4.owner', 'p4.amount', 'p4.source', ''].map((k) => <th key={k} className="px-3 py-3 font-medium">{k && t(lang, k)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {state.balances.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[#7FA3C4]">{t(lang, 'p4.zero_start')}</td></tr>
            )}
            {state.balances.map((b) => {
              const label = equityLabel(b.account_code, cls, lang);
              const err = msg(b.key);
              const equity = b.account_code[0] === '3' || /^25\d{3}$/.test(b.account_code);
              return (
                <tr key={b.key} className="align-top">
                  <td className="px-3 py-2">
                    <input data-ref={b.key} aria-label={t(lang, 'p4.code')} aria-invalid={!!err} className={`${inputCls} w-24 font-mono`} disabled={disabled} maxLength={5} inputMode="numeric"
                      value={b.account_code} onChange={(e) => patch(b.key, { account_code: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                  </td>
                  <td className="px-3 py-2">
                    {label ? <span className="block py-2">{label}</span>
                      : <input data-ref={b.key} aria-label={t(lang, 'p4.name')} className={`${inputCls} min-w-[12rem]`} disabled={disabled} value={b.account_name}
                          onChange={(e) => patch(b.key, { account_name: e.target.value })} />}
                    {err && <span role="alert" className="mt-1 block text-[11px] text-red-300">{err}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {equity ? (
                      <select data-ref={b.key} aria-label={t(lang, 'p4.owner')} className={inputCls} disabled={disabled} value={b.persona_key ?? ''}
                        onChange={(e) => patch(b.key, { persona_key: e.target.value || null })}>
                        <option value="">{t(lang, 'p4.no_owner')}</option>
                        {people.map((p) => <option key={p.persona_key} value={p.persona_key}>{p.nombre || '—'}</option>)}
                      </select>
                    ) : <span className="block py-2 text-[#7FA3C4]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <input data-ref={b.key} aria-label={t(lang, 'p4.amount')} className={`${inputCls} w-36 text-right font-mono`} disabled={disabled} inputMode="decimal" placeholder="0.00"
                      value={b.amount} onChange={(e) => patch(b.key, { amount: e.target.value.replace(/[^0-9.\-]/g, '') })} />
                  </td>
                  <td className="px-3 py-2">
                    <select data-ref={b.key} aria-label={t(lang, 'p4.source')} className={inputCls} disabled={disabled} value={b.source}
                      onChange={(e) => patch(b.key, { source: e.target.value as BalanceSource })}>
                      {BALANCE_SOURCES.map((x) => <option key={x} value={x}>{t(lang, `src.${x}`)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">{!disabled && <button type="button" onClick={() => remove(b.key)} className={btnTiny} aria-label={t(lang, 'wiz.remove')}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => addRow(10100)}>{t(lang, 'p4.add_bank')}</button>
          <button type="button" className={btnGhost} onClick={() => addRow(21000)}>{t(lang, 'p4.add_loan')}</button>
          <button type="button" className={btnGhost} onClick={() => addRow(22000)}>{t(lang, 'p4.add_card')}</button>
          <button type="button" className={btnGhost} onClick={() => addRow(15000)}>{t(lang, 'p4.add_asset')}</button>
          <button type="button" className={btnGhost} onClick={addCapital}>{t(lang, 'p4.add_capital')}</button>
        </div>
      )}

      <Card title={`${t(lang, 'p4.diff')}: ${t(lang, 'p4.formula')}`} right={
        <span className={`rounded-full px-3 py-1 text-xs ${bc.balanced ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {bc.balanced ? `✓ ${t(lang, 'p4.balanced')}` : `✗ ${t(lang, 'p4.unbalanced')}`}
        </span>
      }>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
          {stat(t(lang, 'p4.assets'), bc.assets)}
          {stat(t(lang, 'p4.liabilities'), bc.liabilities)}
          {stat(t(lang, 'p4.equity'), bc.equity)}
          {stat(t(lang, 'p4.diff'), bc.diff, bc.balanced ? 'text-green-300' : 'text-red-300')}
        </div>
        <p className="mt-3 text-xs text-[#7FA3C4]">{t(lang, 'p4.excel_note')}</p>
      </Card>
    </div>
  );
}
