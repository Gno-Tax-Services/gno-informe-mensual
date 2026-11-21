import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS, issueMessage, langOf, t } from './i18n';
import type { IssueCode } from './types';
import { DEMO_CLIENTS, DEMO_PERSONAS, DEMO_SCENARIOS } from './demo-cases';

const ALL_CODES: IssueCode[] = [
  'FIELD_REQUIRED', 'EIN_LAST4_FORMAT', 'DATE_ORDER', 'PCT_INVALID', 'AMOUNT_INVALID', 'ACCOUNT_CODE_INVALID', 'DUPLICATE_ROW', 'ID_IN_TEXT',
  'ENTITY_MISSING', 'CLASS_MISSING', 'CLASS_INVALID_COMBO', 'ELECTION_DOC_MISSING', 'OWNERS_MISSING', 'OWNER_PCT_SUM', 'OWNER_COUNT',
  'OWNER_S_CORP_ENTITY', 'OFFICER_NOT_APPLICABLE', 'BALANCE_EMPTY', 'BALANCE_UNBALANCED', 'BALANCE_OWNER_REQUIRED',
  'BALANCE_ACCOUNT_NOT_IN_TEMPLATE', 'OPENING_BALANCE_EQUITY', 'DISTRIBUTIONS_NOT_PROPORTIONAL', 'S_CORP_OFFICER_NO_PAYROLL',
  'NEGATIVE_CAPITAL', 'WITHDRAWALS_EXCEED_PROFIT', 'UNASSIGNED_MOVEMENTS', 'DIVIDEND_REVIEW',
];

test('español e inglés tienen exactamente las mismas claves', () => {
  const missing = KEYS.filter((k) => t('en', k) === k);
  assert.deepEqual(missing, [], 'claves sin traducción al inglés');
  for (const k of KEYS) assert.notEqual(t('es', k), k);
});

test('los parámetros {x} se sustituyen y ninguno queda sin resolver', () => {
  assert.equal(t('es', 'wiz.step', { n: 3 }), 'Paso 3 de 4');
  assert.equal(t('en', 'wiz.step', { n: 3 }), 'Step 3 of 4');
  assert.equal(t('en', 'sum.closed_on', { date: '2025-12-31' }), 'closed on 2025-12-31');
});

test('todos los códigos de validación tienen mensaje en ambos idiomas', () => {
  for (const lang of ['es', 'en'] as const) for (const code of ALL_CODES) {
    const m = issueMessage(lang, { code, detail: {
      field: 'legal_form', value: '2026-01-01', segments: [{ from: '2026-07-01', total_pct: 90 }], min: 2, max: null, legal_form: 'llc_multi',
      diff: -1, amount: 100, count: 1, owners: [{ nombre: 'A' }], classification: 's_corp', template: 'partnership',
      account_code: '30100', year: 2026, election_form: '2553', effective_date: '2026-01-01' } });
    assert.ok(m.length > 5 && !m.includes('undefined') && !m.includes('NaN'), `${lang} ${code}: ${m}`);
  }
  assert.match(issueMessage('es', { code: 'BALANCE_UNBALANCED', detail: { diff: -1 } }), /-\$0\.01/);
  assert.match(issueMessage('en', { code: 'OWNER_COUNT', detail: { legal_form: 'sole_prop', min: 1, max: 1 } }), /exactly 1/);
});

test('idioma del cliente', () => {
  assert.equal(langOf('english'), 'en');
  assert.equal(langOf('espanol'), 'es');
  assert.equal(langOf(null), 'es');
});

test('modo demo: los ids de demo-cases coinciden con supabase/seed/demo.sql y no hay datos reales', () => {
  const seed = readFileSync(new URL('../../../supabase/seed/demo.sql', import.meta.url), 'utf8');
  for (const id of [...Object.values(DEMO_CLIENTS), ...Object.values(DEMO_PERSONAS)]) assert.ok(seed.includes(id), `falta ${id} en demo.sql`);
  assert.deepEqual(Object.keys(DEMO_SCENARIOS).sort(), Object.values(DEMO_CLIENTS).sort());
  assert.deepEqual(Object.values(DEMO_SCENARIOS).map((s) => s.caseNo).sort(), [2, 3, 4, 5]);
  // El piloto real (caso 1) no aparece en la semilla ni en los escenarios
  const demoCode = readFileSync(new URL('./demo-cases.ts', import.meta.url), 'utf8');
  for (const real of ['MCA', 'Allan', 'Doris', '40,950.76', '110,409.82']) {
    assert.ok(!seed.includes(real) && !demoCode.includes(real), `dato real en demo: ${real}`);
  }
  // Ningún número con forma de SSN/ITIN/EIN en la parte de Entidad y Equity de la semilla
  const part = seed.slice(seed.indexOf('Módulo Entidad y Equity'));
  assert.ok(!/(^|[^0-9])\d{3}-\d{2}-\d{4}([^0-9]|$)|(^|[^0-9])\d{2}-\d{7}([^0-9]|$)|(^|[^0-9])\d{9}([^0-9]|$)/.test(part), 'ID en claro en la semilla');
});
