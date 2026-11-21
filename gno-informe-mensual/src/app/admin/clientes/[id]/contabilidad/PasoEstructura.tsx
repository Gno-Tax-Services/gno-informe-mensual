'use client';

import { LEGAL_FORMS, type LegalForm } from '@/lib/entity/types';
import { t } from '@/lib/entity/i18n';
import { Card, Field, inputCls, type StepProps } from './ui';

/** Paso 1 — estructura corporativa: forma legal, estado y fecha de constitución, cierre fiscal, últimos 4 del EIN. */
export default function PasoEstructura({ lang, state, setState, disabled, msg }: StepProps) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t(lang, 'p1.legal_form')} error={msg('legal_form')}>
          <select data-ref="legal_form" aria-invalid={!!msg('legal_form')} className={inputCls} disabled={disabled}
            value={p.legal_form} onChange={(e) => set({ legal_form: e.target.value as LegalForm | '' })}>
            <option value="">{t(lang, 'p1.choose')}</option>
            {LEGAL_FORMS.map((f) => <option key={f} value={f}>{t(lang, `legal.${f}`)}</option>)}
          </select>
        </Field>
        <Field label={t(lang, 'p1.state')} error={msg('state_of_formation')}>
          <input data-ref="state_of_formation" aria-invalid={!!msg('state_of_formation')} className={inputCls} disabled={disabled}
            maxLength={2} value={p.state_of_formation} autoCapitalize="characters"
            onChange={(e) => set({ state_of_formation: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
        </Field>
        <Field label={`${t(lang, 'p1.formation_date')} (${t(lang, 'wiz.optional')})`} error={msg('formation_date')}>
          <input data-ref="formation_date" type="date" className={inputCls} disabled={disabled}
            value={p.formation_date} onChange={(e) => set({ formation_date: e.target.value })} />
        </Field>
        <Field label={t(lang, 'p1.fiscal_year_end')} error={msg('fiscal_year_end')}>
          <input data-ref="fiscal_year_end" aria-invalid={!!msg('fiscal_year_end')} className={inputCls} disabled={disabled}
            placeholder="12-31" maxLength={5} value={p.fiscal_year_end} onChange={(e) => set({ fiscal_year_end: e.target.value })} />
        </Field>
        <Field label={`${t(lang, 'p1.ein_last4')} (${t(lang, 'wiz.optional')})`} hint={t(lang, 'p1.ein_help')} error={msg('ein_last4')}>
          <input data-ref="ein_last4" aria-invalid={!!msg('ein_last4')} className={`${inputCls} font-mono`} disabled={disabled}
            inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="off" value={p.ein_last4}
            onChange={(e) => set({ ein_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
        </Field>
        <Field label={t(lang, 'p1.basis')}>
          <input className={inputCls} disabled readOnly value={t(lang, 'p1.basis_cash')} />
        </Field>
      </div>
    </Card>
  );
}
