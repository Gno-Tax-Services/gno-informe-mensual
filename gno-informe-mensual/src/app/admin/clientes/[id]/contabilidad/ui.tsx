'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { EntityState, Issue, Lang } from '@/lib/entity/types';
import type { PersonaOption } from '@/lib/entity/server';
import { issueMessage, t } from '@/lib/entity/i18n';

export const inputCls =
  'w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[#7FA3C4]/70 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-400/70';
export const btnGold = 'rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost = 'rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';
export const btnTiny = 'rounded border border-white/20 px-2 py-1 text-xs text-[#B9CBDD] hover:bg-white/5 disabled:opacity-40';

/** Props comunes de cada paso. msg(ref) devuelve el error de ese campo solo si ya se tocó o se intentó avanzar. */
export interface StepProps {
  lang: Lang;
  state: EntityState;
  setState: Dispatch<SetStateAction<EntityState>>;
  issues: Issue[];
  personas: PersonaOption[];
  disabled: boolean;
  msg: (ref: string) => string;
}

export const newKey = () => `n${Math.random().toString(36).slice(2, 9)}`;

export function Field({ label, hint, error, children, className = '' }: {
  label: string; hint?: string; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block text-xs text-[#7FA3C4] ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-[11px] text-red-300">{error}</span>
        : hint ? <span className="mt-1 block text-[11px] text-[#7FA3C4]">{hint}</span> : null}
    </label>
  );
}

export function IssueList({ issues, lang, step }: { issues: Issue[]; lang: Lang; step?: number }) {
  const list = step ? issues.filter((i) => i.step === step) : issues;
  const errors = list.filter((i) => i.severity === 'error');
  const warns = list.filter((i) => i.severity === 'warn');
  return (
    <div aria-live="polite" className="space-y-3">
      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="mb-1 font-medium">{t(lang, 'wiz.errors_title')}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {errors.map((i, n) => <li key={n}>{issueMessage(lang, i)}</li>)}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-green-400/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">✓ {t(lang, 'wiz.none')}</p>
      )}
      {warns.length > 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          <p className="mb-1 font-medium">{t(lang, 'wiz.warnings_title')}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warns.map((i, n) => <li key={n}>{issueMessage(lang, i)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="font-serif text-lg">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
