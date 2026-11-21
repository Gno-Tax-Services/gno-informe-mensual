'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EntityState, Issue, Lang } from '@/lib/entity/types';
import type { DemoScenario } from '@/lib/entity/demo-cases';
import type { EntityBundle, PersonaOption, StoredAccount } from '@/lib/entity/server';
import { canComplete, draftErrors, stepErrors, validateEntity } from '@/lib/entity/rules';
import { issueMessage, t } from '@/lib/entity/i18n';
import { btnGhost, btnGold, IssueList, type StepProps } from './ui';
import PasoEstructura from './PasoEstructura';
import PasoClasificacion from './PasoClasificacion';
import PasoDuenos from './PasoDuenos';
import PasoSaldos from './PasoSaldos';
import Resumen from './Resumen';

export type Mode = 'edit' | 'readonly' | 'demo';
type Step = 1 | 2 | 3 | 4 | 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Asistente de 4 pasos: estructura → clasificación → dueños → saldos iniciales (+ resumen). */
export default function Asistente({ clientId, clientName, initialLang, bundle, mode, demo }: {
  clientId: string; clientName: string; initialLang: Lang; bundle: EntityBundle; mode: Mode; demo: DemoScenario | null;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [state, setState] = useState<EntityState>(bundle.state);
  const [personas, setPersonas] = useState<PersonaOption[]>(bundle.personas);
  const [accounts, setAccounts] = useState<StoredAccount[]>(bundle.accounts);
  const [completedAt, setCompletedAt] = useState<string | null>(bundle.completedAt);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const issues = useMemo(() => validateEntity(state), [state]);
  const first = ([1, 2, 3] as const).find((n) => stepErrors(issues, n).length > 0);
  const [step, setStep] = useState<Step>(() => {
    const iss = validateEntity(bundle.state);
    const bad = ([1, 2, 3, 4] as const).find((n) => stepErrors(iss, n).length > 0);
    return bundle.completedAt ? 5 : bad ?? 5;
  });
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [step]);

  const canSave = mode === 'edit';
  const disabled = mode === 'readonly';
  const reachable = (n: Step) => n === 1 || (first === undefined ? true : n <= first);

  const msg: StepProps['msg'] = (ref) => {
    if (!showErrors && !touched[ref]) return '';
    const i = issues.find((x) => x.ref === ref && x.severity === 'error');
    return i ? issueMessage(lang, i) : '';
  };
  const props: StepProps = { lang, state, setState, issues, personas, disabled, msg };

  /** Aplica lo guardado en la base (ids reales, personas nuevas, catálogo) sin pisar otros pasos sin guardar. */
  function apply(b: EntityBundle, which: 1 | 2 | 3 | 4 | 'all') {
    setPersonas(b.personas);
    setAccounts(b.accounts);
    setCompletedAt(b.completedAt);
    setState((s) => {
      const byName = new Map(b.personas.map((p) => [p.nombre.trim().toLowerCase(), p.id]));
      const remap = (k: string | null) => (k && k.startsWith('new:') ? byName.get(k.slice(4)) ?? k : k);
      const next = { ...s };
      if (which === 1 || which === 'all') next.profile = b.state.profile;
      if (which === 2 || which === 'all') next.classifications = b.state.classifications;
      if (which === 3 || which === 'all') next.owners = b.state.owners;
      if (which === 4 || which === 'all') { next.balances = b.state.balances; next.as_of = b.state.as_of; }
      else next.balances = s.balances.map((x) => ({ ...x, persona_key: remap(x.persona_key) }));
      return next;
    });
  }

  async function post(body: Record<string, unknown>): Promise<EntityBundle | null> {
    try {
      const res = await fetch('/api/compliance/entidad', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, ...body }), cache: 'no-store',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const extra = Array.isArray(j.issues) ? `: ${(j.issues as Issue[]).map((i) => issueMessage(lang, i)).join(' · ')}` : '';
        setError(`${j.error || t(lang, 'err.save')}${extra}`);
        return null;
      }
      return j.bundle as EntityBundle;
    } catch {
      setError(t(lang, 'err.network'));
      return null;
    }
  }

  const payload = (n: 1 | 2 | 3 | 4): Record<string, unknown> => {
    const pid = (k: string | null | undefined) => (k && UUID.test(k) ? k : undefined);
    if (n === 1) return { step: 'profile', profile: state.profile };
    if (n === 2) return { step: 'classifications', rows: state.classifications.map((c) => ({ id: c.id, classification: c.classification, effective_date: c.effective_date, election_form: c.election_form, election_doc: c.election_doc })) };
    if (n === 3) return { step: 'owners', rows: state.owners.map((o) => ({ id: o.id, persona_id: pid(o.persona_id ?? o.persona_key), nombre: o.nombre, role: o.role, holder_type: o.holder_type, ownership_pct: o.ownership_pct, start_date: o.start_date, end_date: o.end_date, is_officer: o.is_officer })) };
    return { step: 'balances', as_of: state.as_of, rows: state.balances.map((b) => ({ account_code: b.account_code, account_name: b.account_name, persona_id: pid(b.persona_key), amount: b.amount, source: b.source })) };
  };

  /** Guarda el paso. Devuelve true si se guardó (o si no hay nada que guardar: demo/solo lectura). */
  async function saveStep(n: 1 | 2 | 3 | 4): Promise<boolean> {
    setError(null);
    if (!canSave) return true;
    if (draftErrors(issues, n).length > 0) { setShowErrors(true); return false; }
    setBusy('save');
    const b = await post(payload(n));
    setBusy(null);
    if (!b) return false;
    apply(b, n);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    return true;
  }

  async function next() {
    if (step === 5) return;
    const n = step as 1 | 2 | 3 | 4;
    // Pasos 1-3: no avanza con errores. Paso 4: puede ir al resumen para ver el detalle; confirmar sí exige cuadre.
    if (n < 4 && stepErrors(issues, n).length > 0) { setShowErrors(true); return; }
    if (!(await saveStep(n))) return;
    setShowErrors(false);
    setStep((n + 1) as Step);
  }

  async function confirm() {
    setError(null);
    if (!canSave || !canComplete(issues)) { setShowErrors(true); return; }
    setBusy('confirm');
    const b4 = await post(payload(4));
    if (!b4) { setBusy(null); return; }
    apply(b4, 4);
    const done = await post({ step: 'complete' });
    setBusy(null);
    if (!done) return;
    apply(done, 'all');
  }

  const stepName = (n: Step) => (n === 5 ? t(lang, 'wiz.summary') : t(lang, `wiz.step${n}`));
  const errs = (n: Step) => (n === 5 ? [] : stepErrors(issues, n));

  return (
    <div ref={top} onBlur={(e) => { const r = (e.target as HTMLElement).dataset?.ref; if (r) setTouched((x) => (x[r] ? x : { ...x, [r]: true })); }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">{t(lang, 'wiz.title')}</h2>
          <p className="text-sm text-[#7FA3C4]">{clientName} · {t(lang, 'wiz.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t(lang, 'wiz.lang')}>
          {(['es', 'en'] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`rounded-md border px-3 py-1 text-sm ${lang === l ? 'border-gold bg-gold/15 text-gold' : 'border-white/20 text-[#B9CBDD] hover:bg-white/5'}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {mode === 'demo' && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          <span>{t(lang, 'wiz.demo_banner')}</span>
          <button type="button" className="rounded border border-gold/50 px-2 py-1 text-xs" onClick={() => { setState(bundle.state); setTouched({}); setShowErrors(false); }}>↺ {t(lang, 'wiz.reset')}</button>
        </div>
      )}
      {mode === 'readonly' && <div role="status" className="mb-4 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-[#B9CBDD]">{t(lang, 'wiz.readonly_banner')}</div>}

      <nav aria-label="Pasos" className="mb-6">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([1, 2, 3, 4, 5] as const).map((n) => {
            const bad = errs(n).length > 0;
            const active = step === n;
            return (
              <li key={n}>
                <button type="button" disabled={!reachable(n)} aria-current={active ? 'step' : undefined} onClick={() => { setError(null); setStep(n); }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${active ? 'border-gold bg-gold/10 text-white' : 'border-white/10 bg-white/[0.03] text-[#B9CBDD] hover:bg-white/5'} disabled:cursor-not-allowed disabled:opacity-40`}>
                  <span className="block text-[11px] uppercase tracking-wide text-[#7FA3C4]">{n === 5 ? '✓' : t(lang, 'wiz.step', { n })}</span>
                  <span className="flex items-center gap-2">{stepName(n)}{n < 5 && <span aria-hidden className={bad ? 'text-red-300' : 'text-green-300'}>{bad ? '●' : '✓'}</span>}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="space-y-4">
        {step === 1 && <PasoEstructura {...props} />}
        {step === 2 && <PasoClasificacion {...props} />}
        {step === 3 && <PasoDuenos {...props} />}
        {step === 4 && <PasoSaldos {...props} />}
        {step === 5 && <Resumen lang={lang} state={state} issues={issues} accounts={accounts} completedAt={completedAt} demo={demo} />}
        {step !== 5 && <IssueList issues={issues} lang={lang} step={step} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <button type="button" className={btnGhost} disabled={step === 1} onClick={() => { setError(null); setStep((step - 1) as Step); }}>← {t(lang, 'wiz.back')}</button>
        <div className="flex flex-wrap items-center gap-3">
          {saved && <span role="status" className="text-sm text-green-300">✓ {t(lang, 'wiz.saved')}</span>}
          {canSave && step !== 5 && (
            <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => saveStep(step as 1 | 2 | 3 | 4)}>
              {busy === 'save' ? t(lang, 'wiz.saving') : t(lang, 'wiz.save')}
            </button>
          )}
          {step !== 5 && (
            <button type="button" className={btnGold} onClick={next}
              disabled={busy !== null || (step < 4 && stepErrors(issues, step).length > 0) || (step === 4 && draftErrors(issues, 4).length > 0)}>
              {t(lang, 'wiz.next')} →
            </button>
          )}
          {step === 5 && canSave && (
            <button type="button" className={btnGold} disabled={busy !== null || !canComplete(issues)} onClick={confirm}>
              {busy === 'confirm' ? t(lang, 'wiz.confirming') : t(lang, 'wiz.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
