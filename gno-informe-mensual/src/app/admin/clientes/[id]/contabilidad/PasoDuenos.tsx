'use client';

import { HOLDER_TYPES, OWNER_ROLES, type HolderType, type OwnerRole } from '@/lib/entity/types';
import { OWNER_LIMITS, PCT_100, ownerSegments, periodsOf } from '@/lib/entity/rules';
import { maskId } from '@/lib/entity/mask';
import { t } from '@/lib/entity/i18n';
import { Card, Field, btnGhost, btnTiny, inputCls, newKey, type StepProps } from './ui';

const fmtPct = (units: number) => `${(units / 10_000).toFixed(4).replace(/\.?0+$/, '')}%`;

/** Paso 3 — dueños. Suma de % en vivo; los SSN/ITIN se ven SOLO enmascarados (últimos 4). */
export default function PasoDuenos({ lang, state, setState, personas, disabled, msg }: StepProps) {
  const form = state.profile.legal_form;
  const segs = ownerSegments(state.owners);
  const corp = periodsOf(state.classifications).some((p) => p.classification === 's_corp' || p.classification === 'c_corp');
  const lim = form ? OWNER_LIMITS[form] : null;

  const patch = (key: string, p: Record<string, unknown>) =>
    setState((s) => ({ ...s, owners: s.owners.map((o) => (o.key === key ? { ...o, ...p } : o)) }));
  const rename = (key: string, nombre: string) => {
    const hit = personas.find((x) => x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
    patch(key, hit
      ? { nombre, persona_key: hit.id, persona_id: hit.id }
      : { nombre, persona_key: `new:${nombre.trim().toLowerCase()}`, persona_id: undefined });
  };
  const defaultRole: OwnerRole = form === 'corporation' ? 'shareholder' : form === 'partnership' || form === 'llc_multi' ? 'partner' : form === 'llc_single' ? 'member' : 'owner';
  const add = () =>
    setState((s) => ({
      ...s,
      owners: [...s.owners, {
        key: newKey(), persona_key: 'new:', nombre: '', role: defaultRole, holder_type: 'individual', ownership_pct: s.owners.length === 0 ? '100' : '',
        start_date: s.profile.formation_date || '', end_date: '', is_officer: false,
      }],
    }));
  /** Nuevo tramo de la misma persona (cambio de participación a mitad de año). */
  const addPeriod = (key: string) =>
    setState((s) => {
      const o = s.owners.find((x) => x.key === key);
      if (!o) return s;
      return { ...s, owners: [...s.owners, { ...o, key: newKey(), id: undefined, ownership_pct: '', start_date: '', end_date: '' }] };
    });
  const remove = (key: string) => setState((s) => ({ ...s, owners: s.owners.filter((o) => o.key !== key) }));

  return (
    <div className="space-y-4">
      <datalist id="personas-list">{personas.map((x) => <option key={x.id} value={x.nombre} />)}</datalist>

      <Card
        title={t(lang, 'p3.sum')}
        right={lim && <span className="text-xs text-[#7FA3C4]">{lim.max === lim.min ? `= ${lim.min}` : `≥ ${lim.min}`}</span>}
      >
        {segs.length === 0 ? <p className="text-sm text-[#7FA3C4]">—</p> : (
          <ul className="flex flex-wrap gap-2" aria-live="polite">
            {segs.map((s) => {
              const ok = s.totalPct === PCT_100;
              return (
                <li key={s.from} className={`rounded-full px-3 py-1 text-sm ${ok ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                  {ok ? '✓' : '✗'} {fmtPct(s.totalPct)} <span className="text-xs opacity-80">{t(lang, 'p3.sum_at', { date: s.from })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[#7FA3C4]">
            <tr>
              {['p3.name', 'p3.role', 'p3.holder', 'p3.pct', 'p3.start', 'p3.end', 'p3.officer', 'p3.ids', ''].map((k) => (
                <th key={k} className="px-3 py-3 font-medium">{k && t(lang, k)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {state.owners.map((o) => {
              const persona = personas.find((x) => x.id === o.persona_key);
              const err = msg(o.key);
              return (
                <tr key={o.key} className="align-top">
                  <td className="px-3 py-2">
                    <input data-ref={o.key} aria-label={t(lang, 'p3.name')} aria-invalid={!!err} className={`${inputCls} min-w-[11rem]`} list="personas-list" disabled={disabled}
                      placeholder={t(lang, 'p3.name_ph')} value={o.nombre} onChange={(e) => rename(o.key, e.target.value)} />
                    {o.nombre.trim() && <span className="mt-1 block text-[11px] text-[#7FA3C4]">{persona ? t(lang, 'p3.existing_person') : t(lang, 'p3.new_person')}</span>}
                    {err && <span role="alert" className="mt-1 block text-[11px] text-red-300">{err}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select data-ref={o.key} aria-label={t(lang, 'p3.role')} className={`${inputCls} min-w-[8rem]`} disabled={disabled} value={o.role}
                      onChange={(e) => patch(o.key, { role: e.target.value as OwnerRole })}>
                      {OWNER_ROLES.map((r) => <option key={r} value={r}>{t(lang, `role.${r}`)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select data-ref={o.key} aria-label={t(lang, 'p3.holder')} className={`${inputCls} min-w-[9rem]`} disabled={disabled} value={o.holder_type}
                      onChange={(e) => patch(o.key, { holder_type: e.target.value as HolderType, is_officer: e.target.value === 'entity' ? false : o.is_officer })}>
                      {HOLDER_TYPES.map((h) => <option key={h} value={h}>{t(lang, `holder.${h}`)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input data-ref={o.key} aria-label={t(lang, 'p3.pct')} className={`${inputCls} w-24 text-right font-mono`} disabled={disabled} inputMode="decimal"
                      placeholder="50" value={o.ownership_pct} onChange={(e) => patch(o.key, { ownership_pct: e.target.value.replace(/[^0-9.]/g, '') })} />
                  </td>
                  <td className="px-3 py-2"><input data-ref={o.key} aria-label={t(lang, 'p3.start')} type="date" className={inputCls} disabled={disabled} value={o.start_date} onChange={(e) => patch(o.key, { start_date: e.target.value })} /></td>
                  <td className="px-3 py-2"><input data-ref={o.key} aria-label={t(lang, 'p3.end')} type="date" className={inputCls} disabled={disabled} value={o.end_date} onChange={(e) => patch(o.key, { end_date: e.target.value })} /></td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" aria-label={t(lang, 'p3.officer')} className="h-4 w-4 accent-[#C49A2E]" disabled={disabled || !corp || o.holder_type === 'entity'}
                      checked={o.is_officer} onChange={(e) => patch(o.key, { is_officer: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    {persona && persona.ids.length > 0 ? (
                      <ul className="space-y-0.5 whitespace-nowrap font-mono text-xs text-[#B9CBDD]">
                        {persona.ids.map((i, n) => <li key={n}><span className="text-[#7FA3C4]">{i.tipo}</span> <span className="select-none">{maskId(i.tipo, i.last4)}</span></li>)}
                      </ul>
                    ) : <span className="text-xs text-[#7FA3C4]">{t(lang, 'p3.no_ids')}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {!disabled && (
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => addPeriod(o.key)} className={btnTiny} title={t(lang, 'p3.add')}>+ ⟳</button>
                        <button type="button" onClick={() => remove(o.key)} className={btnTiny} aria-label={t(lang, 'wiz.remove')}>✕</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!disabled ? <button type="button" onClick={add} className={btnGhost}>+ {t(lang, 'p3.add')}</button> : <span />}
        <p className="max-w-xl text-xs text-[#7FA3C4]">{t(lang, 'p3.ids_note')}</p>
      </div>
    </div>
  );
}
