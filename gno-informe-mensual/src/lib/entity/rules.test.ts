import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_CLASSIFICATIONS, EQUITY_TEMPLATES, accountType, allowedClassifications, balanceCheck, canComplete, classificationOn,
  draftErrors, equityCodeRole, isValidCombo, ownerSegments, parsePct, provisionPreview, statementsReady, validateEntity, withdrawalLabel,
} from './rules';
import { allocate, fmtUSD, toCents } from './money';
import { maskId } from './mask';
import { daysInclusive, fiscalYearWindow } from './dates';
import { bal, cls, owner, profile, state } from './fixtures';
import { CLASSIFICATIONS, LEGAL_FORMS, type EntityState } from './types';

const codes = (s: EntityState, sev: 'error' | 'warn' = 'error') =>
  validateEntity(s).filter((i) => i.severity === sev).map((i) => i.code).sort();

/* ───── Combinaciones forma legal × clasificación (tabla de la spec) ───── */
test('combinaciones válidas forma legal × clasificación = tabla de la spec', () => {
  const spec: Record<string, string[]> = {
    sole_prop: ['disregarded'],
    llc_single: ['disregarded', 's_corp', 'c_corp'],
    llc_multi: ['partnership', 's_corp', 'c_corp'],
    partnership: ['partnership'],
    corporation: ['s_corp', 'c_corp'],
  };
  let checked = 0;
  for (const f of LEGAL_FORMS) {
    assert.deepEqual([...allowedClassifications(f)].sort(), [...spec[f]].sort(), f);
    for (const c of CLASSIFICATIONS) { assert.equal(isValidCombo(f, c), spec[f].includes(c), `${f} + ${c}`); checked++; }
  }
  assert.equal(checked, 20);
  assert.deepEqual(allowedClassifications(''), []);
  assert.equal(Object.keys(ALLOWED_CLASSIFICATIONS).length, 5);
});

test('una clasificación inválida para la forma legal es error en el paso 2', () => {
  const s = state(profile('partnership'), [cls('s_corp', '2026-01-01')], [owner('a', 'A', '50'), owner('b', 'B', '50')]);
  assert.ok(codes(s).includes('CLASS_INVALID_COMBO'));
  assert.ok(!statementsReady(validateEntity(s)));
});

test('clasificación vigente: la effective_date más reciente <= fecha', () => {
  const cs = [cls('disregarded', '2024-01-01'), cls('s_corp', '2026-01-01')];
  assert.equal(classificationOn(cs, '2023-12-31'), null);
  assert.equal(classificationOn(cs, '2025-12-31'), 'disregarded');
  assert.equal(classificationOn(cs, '2026-01-01'), 's_corp');
});

/* ───── Suma de % = 100 ───── */
const partners = (a: string, b: string, extra: Partial<Parameters<typeof owner>[3]> = {}) =>
  state(profile('llc_multi'), [cls('partnership', '2020-01-01')], [owner('a', 'A', a, extra), owner('b', 'B', b, extra)]);

test('suma de porcentajes: 50/50 válido; 60/30 y 60/45 inválidos', () => {
  assert.deepEqual(codes(partners('50', '50')), []);
  assert.ok(codes(partners('60', '30')).includes('OWNER_PCT_SUM'));
  assert.ok(codes(partners('60', '45')).includes('OWNER_PCT_SUM'));
});

test('suma de porcentajes con 4 decimales, sin errores de punto flotante', () => {
  const tres = (c: string) => state(profile('llc_multi'), [cls('partnership', '2020-01-01')],
    [owner('a', 'A', '33.3333'), owner('b', 'B', '33.3333'), owner('c', 'C', c)]);
  assert.ok(codes(tres('33.3333')).includes('OWNER_PCT_SUM'));
  assert.deepEqual(codes(tres('33.3334')), []);
  assert.equal(parsePct('33.3334'), 333334);
  assert.equal(parsePct('0'), null);
  assert.equal(parsePct('100.0001'), null);
  assert.equal(parsePct('12.12345'), null);
  assert.equal(parsePct('abc'), null);
  assert.equal(parsePct('100'), 1_000_000);
});

test('caso 5: 50/50 → 70/30 el 01/07 suma 100 en cada tramo; si un tramo falla se señala la fecha', () => {
  const mk = (b2: string) => state(profile('partnership'), [cls('partnership', '2020-01-01')], [
    owner('a', 'Socia A', '50', { end_date: '2026-06-30' }), owner('b', 'Socio B', '50', { end_date: '2026-06-30' }),
    owner('a', 'Socia A', '70', { start_date: '2026-07-01' }), owner('b', 'Socio B', b2, { start_date: '2026-07-01' }),
  ]);
  assert.deepEqual(codes(mk('30')), []);
  assert.equal(ownerSegments(mk('30').owners).length, 2);
  const bad = validateEntity(mk('20')).find((i) => i.code === 'OWNER_PCT_SUM')!;
  assert.deepEqual((bad.detail!.segments as { from: string }[]).map((x) => x.from), ['2026-07-01']);
});

test('un hueco entre dueños (nadie vigente entre dos fechas) es error', () => {
  const s = state(profile('partnership'), [cls('partnership', '2020-01-01')], [
    owner('a', 'A', '50', { end_date: '2026-03-31' }), owner('b', 'B', '50'),
    owner('a', 'A', '50', { start_date: '2026-06-01' }),
  ]);
  assert.ok(codes(s).includes('OWNER_PCT_SUM'));
});

/* ───── Número de dueños y reglas de S-corp ───── */
test('número de dueños por forma legal', () => {
  const one = (form: Parameters<typeof profile>[0], c: Parameters<typeof cls>[0]) =>
    state(profile(form), [cls(c, '2020-01-01')], [owner('a', 'A', '100', { role: 'owner' })]);
  assert.deepEqual(codes(one('sole_prop', 'disregarded')), []);
  assert.deepEqual(codes(one('corporation', 's_corp')), []);
  assert.deepEqual(codes(one('llc_single', 'disregarded')), []);
  assert.ok(codes(one('llc_multi', 'partnership')).includes('OWNER_COUNT'));
  assert.ok(codes(one('partnership', 'partnership')).includes('OWNER_COUNT'));
  const two = (form: Parameters<typeof profile>[0], c: Parameters<typeof cls>[0]) =>
    state(profile(form), [cls(c, '2020-01-01')], [owner('a', 'A', '50'), owner('b', 'B', '50')]);
  assert.ok(codes(two('sole_prop', 'disregarded')).includes('OWNER_COUNT'));
  assert.ok(codes(two('llc_single', 'disregarded')).includes('OWNER_COUNT'));
  assert.ok(codes(state(profile('corporation'), [cls('c_corp', '2020-01-01')], [])).includes('OWNERS_MISSING'));
});

test('S-corp con un dueño que no es persona física → bloqueo; C-corp sí lo permite', () => {
  const mk = (c: Parameters<typeof cls>[0]) => state(profile('corporation'), [cls(c, '2020-01-01')], [
    owner('a', 'Persona', '50', { role: 'shareholder' }), owner('b', 'Otra LLC', '50', { role: 'shareholder', holder_type: 'entity' }),
  ]);
  assert.ok(codes(mk('s_corp')).includes('OWNER_S_CORP_ENTITY'));
  assert.ok(!codes(mk('c_corp')).includes('OWNER_S_CORP_ENTITY'));
});

test('is_officer fuera de S-corp/C-corp es solo un aviso', () => {
  const s = partners('50', '50', {});
  s.owners[0].is_officer = true;
  assert.deepEqual(codes(s), []);
  assert.ok(codes(s, 'warn').includes('OFFICER_NOT_APPLICABLE'));
});

test('validaciones de formato de campos', () => {
  const s = state(profile('llc_single', { ein_last4: '12', fiscal_year_end: '13-45', state_of_formation: 'Louisiana' }), [], []);
  const c = codes(s);
  assert.ok(c.includes('EIN_LAST4_FORMAT'));
  assert.ok(c.filter((x) => x === 'FIELD_REQUIRED').length >= 2);
  assert.ok(codes(state(profile(''), [], [])).includes('FIELD_REQUIRED'));
  assert.deepEqual(codes(state(profile('llc_single', { ein_last4: '4321' }), [cls('disregarded', '2020-01-01')], [owner('a', 'A', '100', { role: 'member' })])), []);
});

/* ───── Cuadre de saldos iniciales ───── */
const sole = (balances = [bal('10100', '20000'), bal('30000', '20000')]) =>
  state(profile('sole_prop'), [cls('disregarded', '2020-01-01')], [owner('a', 'A', '100', { role: 'owner' })], '2025-12-31', balances);

test('cuadre: activos − pasivos − capital = 0', () => {
  assert.deepEqual(codes(sole()), []);
  const c = balanceCheck([bal('10100', '50000'), bal('15000', '30000'), bal('21000', '25000'), bal('22000', '5000'), bal('30000', '50000')]);
  assert.deepEqual([c.assets, c.liabilities, c.equity, c.diff, c.balanced], [8_000_000, 3_000_000, 5_000_000, 0, true]);
  const off = sole([bal('10100', '20000'), bal('30000', '20000.01')]);
  assert.ok(codes(off).includes('BALANCE_UNBALANCED'));
  assert.equal(validateEntity(off).find((i) => i.code === 'BALANCE_UNBALANCED')!.detail!.diff, -1);
  assert.ok(!canComplete(validateEntity(off)));
  assert.ok(statementsReady(validateEntity(off)), 'el descuadre no impide procesar statements (solo confirmar el alta)');
});

test('saldos: sin filas es solo un aviso; códigos y montos inválidos son error', () => {
  assert.deepEqual(codes(sole([]), 'warn'), ['BALANCE_EMPTY']);
  assert.deepEqual(codes(sole([])), []);
  assert.ok(codes(sole([bal('40000', '1')])).includes('ACCOUNT_CODE_INVALID'));
  assert.ok(codes(sole([bal('10100', 'abc')])).includes('AMOUNT_INVALID'));
  assert.ok(codes(sole([bal('10100', '1'), bal('10100', '1')])).includes('DUPLICATE_ROW'));
});

test('saldos de partnership: capital por dueño, no un solo total (piloto 40,950.76 → 20,475.38 c/u)', () => {
  const mk = (rows: ReturnType<typeof bal>[]) => state(profile('llc_multi'), [cls('partnership', '2020-01-01')],
    [owner('a', 'Socio A', '50'), owner('b', 'Socio B', '50')], '2025-12-31', rows);
  assert.ok(codes(mk([bal('10100', '40950.76'), bal('30100', '40950.76')])).includes('BALANCE_OWNER_REQUIRED'));
  assert.deepEqual(codes(mk([bal('10100', '40950.76'), bal('30100', '20475.38', 'a'), bal('30101', '20475.38', 'b')])), []);
  assert.ok(codes(mk([bal('10100', '0'), bal('31000', '0', 'a')])).includes('BALANCE_ACCOUNT_NOT_IN_TEMPLATE'));
});

test('saldos de S-corp: Common Stock por accionista; Opening Balance Equity con saldo avisa', () => {
  const mk = (rows: ReturnType<typeof bal>[]) => state(profile('corporation'), [cls('s_corp', '2020-01-01')],
    [owner('a', 'Acc A', '60', { role: 'shareholder' }), owner('b', 'Acc B', '40', { role: 'shareholder' })], '2025-12-31', rows);
  assert.ok(codes(mk([bal('10100', '10000'), bal('31000', '10000')])).includes('BALANCE_OWNER_REQUIRED'));
  assert.deepEqual(codes(mk([bal('10100', '10000'), bal('31000', '6000', 'a'), bal('31000', '4000', 'b')])), []);
  const obe = mk([bal('10100', '10500'), bal('31000', '6000', 'a'), bal('31000', '4000', 'b'), bal('39000', '500')]);
  assert.deepEqual(codes(obe), []);
  assert.deepEqual(codes(obe, 'warn'), ['OPENING_BALANCE_EQUITY']);
});

test('tipo de cuenta por primer dígito y rol por código', () => {
  assert.deepEqual(['10100', '25000', '30000', '40000'].map(accountType), ['asset', 'liability', 'equity', null]);
  assert.equal(equityCodeRole('30101'), 'partner_capital');
  assert.equal(equityCodeRole('33001'), 'distributions');
  assert.equal(equityCodeRole('25001'), 'shareholder_loans');
  assert.equal(equityCodeRole('39000'), 'opening_balance_equity');
  assert.equal(equityCodeRole('36000'), null);
  for (const c of CLASSIFICATIONS) for (const l of EQUITY_TEMPLATES[c]) assert.equal(equityCodeRole(l.code), l.role, `${c} ${l.code}`);
});

/* ───── Plantillas y catálogo ───── */
test('plantillas de Equity = tabla de la spec', () => {
  const view = (c: (typeof CLASSIFICATIONS)[number]) => EQUITY_TEMPLATES[c].map((l) => `${l.code}${l.per_owner ? '*' : ''}`).sort();
  assert.deepEqual(view('disregarded'), ['30000', '30500', '30700']);
  assert.deepEqual(view('partnership'), ['30100*', '30500*', '30700*']);
  assert.deepEqual(view('s_corp'), ['25000*', '31000', '31500', '32000', '33000*']);
  assert.deepEqual(view('c_corp'), ['25000*', '31000', '31500', '32000', '34000*']);
  assert.deepEqual(CLASSIFICATIONS.map(withdrawalLabel), ['draws', 'distributions', 'distributions', 'dividends']);
});

const accts = (s: EntityState) => provisionPreview(s).map((a) => `${a.code} ${a.name_en}${a.closed_on ? ' [cerrada ' + a.closed_on + ']' : ''}`);

test('catálogo: partnership 50/50 crea 30100 Capital – Socio A y 30101 Capital – Socio B (ejemplo de la spec)', () => {
  const s = state(profile('llc_multi'), [cls('partnership', '2020-01-01')], [owner('a', 'Socio A', '50'), owner('b', 'Socio B', '50')]);
  assert.deepEqual(accts(s), [
    '30100 Partner Capital – Socio A', '30101 Partner Capital – Socio B',
    '30500 Partner Contributions – Socio A', '30501 Partner Contributions – Socio B',
    '30700 Partner Distributions – Socio A', '30701 Partner Distributions – Socio B',
  ]);
});

test('catálogo: un cambio de % no duplica cuentas por socio (caso 5)', () => {
  const s = state(profile('partnership'), [cls('partnership', '2020-01-01')], [
    owner('a', 'Socia A', '50', { end_date: '2026-06-30' }), owner('b', 'Socio B', '50', { end_date: '2026-06-30' }),
    owner('a', 'Socia A', '70', { start_date: '2026-07-01' }), owner('b', 'Socio B', '30', { start_date: '2026-07-01' }),
  ]);
  assert.equal(provisionPreview(s).filter((a) => a.role === 'partner_capital').length, 2);
});

test('catálogo: sole proprietor (caso 2), S-corp 60/40 (caso 4) y C-corp', () => {
  assert.deepEqual(accts(state(profile('sole_prop'), [cls('disregarded', '2020-01-01')], [owner('a', 'Dueña', '100', { role: 'owner' })])),
    ["30000 Owner's Capital", "30500 Owner's Contributions", "30700 Owner's Draws"]);
  assert.deepEqual(accts(state(profile('corporation'), [cls('s_corp', '2020-01-01')], [owner('a', 'A60', '60', { role: 'shareholder' }), owner('b', 'B40', '40', { role: 'shareholder' })])), [
    '25000 Loans from Shareholders – A60', '25001 Loans from Shareholders – B40', '31000 Common Stock', '31500 Additional Paid-in Capital',
    '32000 Retained Earnings / AAA', '33000 Shareholder Distributions – A60', '33001 Shareholder Distributions – B40']);
  assert.ok(accts(state(profile('corporation'), [cls('c_corp', '2020-01-01')], [owner('a', 'Único', '100', { role: 'shareholder' })]))
    .includes('34000 Dividends Paid – Único'));
});

test('caso 3: LLC → S-corp el 01/01 cierra la plantilla anterior el 31/12 y abre la nueva', () => {
  const s = state(profile('llc_single'), [cls('disregarded', '2024-01-01'), cls('s_corp', '2026-01-01')],
    [owner('a', 'Miembro', '100', { role: 'member', start_date: '2024-01-01', is_officer: true })]);
  const all = provisionPreview(s);
  assert.ok(all.filter((a) => a.template === 'disregarded').every((a) => a.closed_on === '2025-12-31'));
  assert.ok(all.filter((a) => a.template === 's_corp').every((a) => a.closed_on === null && a.opened_on === '2026-01-01'));
  assert.equal(all.length, 3 + 5);
});

test('no se arma catálogo si los pasos 1-3 tienen errores', () => {
  assert.deepEqual(provisionPreview(state(profile('llc_multi'), [cls('partnership', '2020-01-01')], [owner('a', 'A', '50'), owner('b', 'B', '40')])), []);
});

/* ───── Dinero, fechas ───── */
test('allocate: la suma de las partes es exacta (resto mayor)', () => {
  assert.deepEqual(allocate(-1_047_309, [1, 1]), [-523_655, -523_654]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(1000, [0, 0]), [0, 0]);
  for (const t of [1, 99, 100_001, -7, 14_277_758]) for (const w of [[1, 1], [60, 40], [181, 184, 3], [7, 3]]) {
    assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
});

test('toCents / fmtUSD', () => {
  assert.equal(toCents('20,475.38'), 2_047_538);
  assert.equal(toCents('$-5.5'), -550);
  assert.equal(toCents('1.234'), null);
  assert.equal(toCents(''), null);
  assert.equal(fmtUSD(6_284_543), '$62,845.43');
});

test('fechas: días inclusivos y ejercicio fiscal', () => {
  assert.equal(daysInclusive('2026-01-01', '2026-06-30'), 181);
  assert.equal(daysInclusive('2026-07-01', '2026-12-31'), 184);
  assert.equal(daysInclusive('2026-02-01', '2026-01-01'), 0);
  assert.deepEqual(fiscalYearWindow(2026, '12-31'), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(fiscalYearWindow(2026, '06-30'), { start: '2025-07-01', end: '2026-06-30' });
  assert.deepEqual(fiscalYearWindow(2027, '02-29'), { start: '2026-03-01', end: '2027-02-28' });
});

test('texto libre con aspecto de SSN/ITIN/EIN se rechaza; solo los últimos 4 se aceptan', () => {
  const s = state(profile('llc_single'), [cls('s_corp', '2026-01-01', { election_doc: 'carta 123-45-6789.pdf' })],
    [owner('a', 'Ana 12-3456789', '100', { role: 'member' })], '2025-12-31', [bal('10100', '1', null, { account_name: '987654321' })]);
  const ids = validateEntity(s).filter((i) => i.code === 'ID_IN_TEXT');
  assert.equal(ids.length, 3);
  assert.ok(draftErrors(validateEntity(s), 2).length > 0, 'ID en texto bloquea incluso el borrador');
  assert.deepEqual(codes(state(profile('llc_single'), [cls('s_corp', '2026-01-01', { election_doc: 'Drive/Carta 2553 (0123).pdf' })],
    [owner('a', 'Ana Pérez', '100', { role: 'member' })])), []);
  assert.equal(maskId('SSN', '1234'), '•••-••-1234');
  assert.equal(maskId('EIN', '4321'), '••-•••4321');
  assert.equal(maskId('SSN', '123456789'), '—', 'un valor completo nunca se muestra');
  assert.equal(maskId('SSN', null), '—');
});

test('qué errores bloquean el borrador y cuáles solo "Siguiente"', () => {
  const sumaMala = validateEntity(partners('60', '30'));
  assert.ok(codes(partners('60', '30')).includes('OWNER_PCT_SUM'));
  assert.deepEqual(draftErrors(sumaMala, 3), [], 'suma ≠ 100 se puede guardar a medias');
  assert.ok(!statementsReady(sumaMala));
  const pctMal = validateEntity(partners('abc', '50'));
  assert.ok(draftErrors(pctMal, 3).length > 0, 'un % ilegible no se puede guardar');
});
