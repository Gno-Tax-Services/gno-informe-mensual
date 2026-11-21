'use client';

import type { EntityState, Lang } from '@/lib/entity/types';
import type { DemoScenario } from '@/lib/entity/demo-cases';
import type { StoredAccount } from '@/lib/entity/server';
import { periodsOf, provisionPreview, statementsReady, withdrawalLabel } from '@/lib/entity/rules';
import type { Issue } from '@/lib/entity/types';
import { t } from '@/lib/entity/i18n';
import { Card, IssueList } from './ui';
import VistaCierreDemo from './VistaCierreDemo';

interface Row { code: string; name: string; perOwner: boolean; opened: string; closed: string | null; template: string }

/** Resumen: catálogo de Equity listo para que GNO lo confirme + estado para procesar statements. */
export default function Resumen({ lang, state, issues, accounts, completedAt, demo }: {
  lang: Lang; state: EntityState; issues: Issue[]; accounts: StoredAccount[]; completedAt: string | null; demo: DemoScenario | null;
}) {
  const ready = statementsReady(issues);
  const stored = !!completedAt && accounts.length > 0;
  const rows: Row[] = stored
    ? accounts.map((a) => ({ code: a.code, name: lang === 'es' ? a.name_es : a.name_en, perOwner: !!a.persona_id, opened: a.opened_on, closed: a.closed_on, template: a.template }))
    : provisionPreview(state).map((a) => ({ code: a.code, name: lang === 'es' ? a.name_es : a.name_en, perOwner: !!a.persona_key, opened: a.opened_on, closed: a.closed_on, template: a.template }));
  const current = periodsOf(state.classifications).filter((p) => p.to === null).pop();
  const fmtDate = completedAt ? new Date(completedAt).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { timeZone: 'America/Chicago' }) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {ready ? `✓ ${t(lang, 'wiz.ready')}` : `✗ ${t(lang, 'wiz.not_ready')}`}
        </span>
        {completedAt && <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-[#B9CBDD]">{t(lang, 'wiz.completed', { date: fmtDate })}</span>}
        {current && <span className="text-sm text-[#7FA3C4]">{t(lang, `class.${current.classification}`)} · {t(lang, 'sum.label.' + withdrawalLabel(current.classification))}</span>}
      </div>

      <IssueList issues={issues} lang={lang} />

      <Card title={t(lang, 'sum.catalog')} right={stored ? <span className="text-xs text-green-300">{t(lang, 'sum.stored')}: {rows.length}</span> : undefined}>
        <p className="mb-3 text-xs text-[#7FA3C4]">{t(lang, 'sum.catalog_help')}</p>
        {rows.length === 0 ? <p className="text-sm text-[#7FA3C4]">{t(lang, 'sum.empty')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#7FA3C4]"><tr>
                <th className="py-2 pr-3 font-medium">{t(lang, 'sum.code')}</th><th className="py-2 pr-3 font-medium">{t(lang, 'sum.account')}</th>
                <th className="py-2 pr-3 font-medium">{t(lang, 'sum.per_owner')}</th><th className="py-2 font-medium">{t(lang, 'sum.valid')}</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, i) => (
                  <tr key={i} className={r.closed ? 'text-[#7FA3C4]' : ''}>
                    <td className="py-2 pr-3 font-mono">{r.code}</td>
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3">{r.perOwner ? '✓' : ''}</td>
                    <td className="py-2 text-xs">{t(lang, 'sum.from', { date: r.opened })} · {r.closed ? t(lang, 'sum.closed_on', { date: r.closed }) : t(lang, 'sum.open')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {demo && <VistaCierreDemo lang={lang} state={state} scenario={demo} />}
    </div>
  );
}
