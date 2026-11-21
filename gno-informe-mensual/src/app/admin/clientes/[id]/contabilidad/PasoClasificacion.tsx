'use client';

import { useEffect, useState } from 'react';
import { CLASSIFICATIONS, ELECTION_FORMS, type Classification, type ElectionForm } from '@/lib/entity/types';
import { allowedClassifications, periodsOf } from '@/lib/entity/rules';
import { t } from '@/lib/entity/i18n';
import { Card, Field, btnGhost, btnTiny, inputCls, newKey, type StepProps } from './ui';

/** Paso 2 — clasificación fiscal. Solo ofrece las opciones válidas para la forma legal elegida. */
export default function PasoClasificacion({ lang, state, setState, disabled, msg }: StepProps) {
  const form = state.profile.legal_form;
  const allowed = allowedClassifications(form);
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);
  const current = periodsOf(state.classifications).filter((p) => today && p.from <= today).pop()?.key;

  const patch = (key: string, p: Record<string, unknown>) =>
    setState((s) => ({ ...s, classifications: s.classifications.map((c) => (c.key === key ? { ...c, ...p } : c)) }));
  const add = () =>
    setState((s) => ({
      ...s,
      classifications: [...s.classifications, {
        key: newKey(), classification: allowed[0] ?? '', effective_date: '', election_form: allowed[0] === 's_corp' ? '2553' : 'none', election_doc: '',
      }],
    }));
  const remove = (key: string) => setState((s) => ({ ...s, classifications: s.classifications.filter((c) => c.key !== key) }));
  const pick = (key: string, c: Classification | '') =>
    setState((s) => ({
      ...s,
      classifications: s.classifications.map((r) => r.key !== key ? r : {
        ...r, classification: c,
        election_form: c === 's_corp' ? '2553' : r.election_form === '2553' ? 'none' : r.election_form,
      }),
    }));

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#B9CBDD]">{t(lang, 'p2.help')}</p>
      {!form && <p className="text-sm text-gold">{t(lang, 'p2.pick_legal_first')}</p>}
      {form && (
        <p className="text-xs text-[#7FA3C4]">
          {t(lang, 'p2.valid_for', { form: t(lang, `legal.${form}`) })}: {allowed.map((c) => t(lang, `class.${c}`)).join(' · ')}
        </p>
      )}
      <Card title={t(lang, 'p2.history')}>
        <div className="space-y-4">
          {state.classifications.map((c) => (
            <div key={c.key} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-12">
              <Field className="sm:col-span-3" label={t(lang, 'p2.classification')} error={msg(c.key)}>
                <select data-ref={c.key} aria-invalid={!!msg(c.key)} className={inputCls} disabled={disabled || !form}
                  value={c.classification} onChange={(e) => pick(c.key, e.target.value as Classification | '')}>
                  <option value="">{t(lang, 'p1.choose')}</option>
                  {CLASSIFICATIONS.filter((x) => allowed.includes(x) || x === c.classification).map((x) => (
                    <option key={x} value={x}>{t(lang, `class.${x}`)}</option>
                  ))}
                </select>
              </Field>
              <Field className="sm:col-span-2" label={t(lang, 'p2.effective_date')}>
                <input data-ref={c.key} type="date" className={inputCls} disabled={disabled} value={c.effective_date}
                  onChange={(e) => patch(c.key, { effective_date: e.target.value })} />
              </Field>
              <Field className="sm:col-span-2" label={t(lang, 'p2.election_form')}>
                <select data-ref={c.key} className={inputCls} disabled={disabled} value={c.election_form}
                  onChange={(e) => patch(c.key, { election_form: e.target.value as ElectionForm })}>
                  {ELECTION_FORMS.map((f) => <option key={f} value={f}>{t(lang, `election.${f}`)}</option>)}
                </select>
              </Field>
              <Field className="sm:col-span-4" label={t(lang, 'p2.election_doc')} hint={c.election_form !== 'none' ? t(lang, 'p2.drive_hint') : undefined}>
                <input data-ref={c.key} className={inputCls} disabled={disabled || c.election_form === 'none'} placeholder={t(lang, 'p2.election_doc_ph')}
                  value={c.election_doc} onChange={(e) => patch(c.key, { election_doc: e.target.value })} />
              </Field>
              <div className="flex items-end justify-end gap-2 sm:col-span-1">
                {current === c.key && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-300">{t(lang, 'p2.current')}</span>}
                {!disabled && <button type="button" onClick={() => remove(c.key)} className={btnTiny} aria-label={t(lang, 'wiz.remove')}>✕</button>}
              </div>
            </div>
          ))}
        </div>
        {!disabled && <button type="button" onClick={add} disabled={!form} className={`${btnGhost} mt-4`}>+ {t(lang, 'p2.add')}</button>}
      </Card>
    </div>
  );
}
