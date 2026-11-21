import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateProfit, closeYear, conversionEntry, isBalanced, ownerWeights, reviewAlerts, NET_INCOME } from './closing';
import { owner } from './fixtures';

const ok = (r: ReturnType<typeof closeYear>) => r.entries.forEach((e) => assert.ok(isBalanced(e), `asiento ${e.id} descuadrado`));

/* ───── Caso 1 (piloto, cifras de la spec; dueños anonimizados) ───── */
test('caso 1: partnership 50/50 cuadra con el capital del Balance del piloto ($62,845.43)', () => {
  const owners = [owner('a', 'Socio A', '50'), owner('b', 'Socio B', '50')];
  const r = closeYear({
    classification: 'partnership', owners, year: 2026,
    profitCents: 14_277_758,                       // utilidad ene–sep 2026 $142,777.58
    priorAdjustmentsCents: -1_047_309,             // ajustes de años anteriores −$10,473.09
    openingCapital: { a: 2_047_538, b: 2_047_538 }, // $20,475.38 cada uno
    withdrawals: { a: 5_520_491, b: 5_520_491 },   // $110,409.82 de retiros, 50/50
  });
  ok(r);
  assert.deepEqual(r.owners.map((o) => o.profit), [7_138_879, 7_138_879]);         // $71,388.79 c/u
  assert.equal(r.owners[0].adjustments + r.owners[1].adjustments, -1_047_309);      // los ajustes suman exacto
  assert.equal(r.owners[0].withdrawals + r.owners[1].withdrawals, 11_040_982);
  assert.equal(r.totalEnding, 6_284_543, 'capital total = $62,845.43');
  // El centavo que sobra en los ajustes (−5,236.545 c/u) va al primer socio
  assert.deepEqual(r.owners.map((o) => o.ending), [3_142_271, 3_142_272]);
});

/* ───── Caso 2: sole proprietor ───── */
test('caso 2: utilidad y retiros cierran contra 30000; ningún retiro queda sin dueño', () => {
  const r = closeYear({
    classification: 'disregarded', owners: [owner('a', 'Dueña', '100', { role: 'owner' })], year: 2026,
    profitCents: 8_500_000, openingCapital: { _: 1_000_000 }, contributions: { _: 500_000 }, withdrawals: { _: 4_000_000 },
  });
  ok(r);
  assert.equal(r.owners.length, 1);
  assert.equal(r.owners[0].ending, 1_000_000 + 8_500_000 + 500_000 - 4_000_000);
  const accounts = new Set(r.entries.flatMap((e) => e.lines.map((l) => l.account)));
  assert.deepEqual(Array.from(accounts).sort(), ['30000', '30500', '30700', NET_INCOME].sort());
  // 30700 Draws se cierra contra 30000: Dr 30000 / Cr 30700
  const draws = r.entries.find((e) => e.id === 'draws')!;
  assert.deepEqual(draws.lines.map((l) => [l.account, l.debit, l.credit]), [['30000', 4_000_000, 0], ['30700', 0, 4_000_000]]);
});

test('una pérdida invierte el asiento de utilidad', () => {
  const r = closeYear({ classification: 'disregarded', owners: [owner('a', 'D', '100', { role: 'owner' })], year: 2026, profitCents: -250_000 });
  ok(r);
  const l = r.entries[0].lines;
  assert.deepEqual(l.map((x) => [x.account, x.debit, x.credit]), [[NET_INCOME, 0, 250_000], ['30000', 250_000, 0]]);
});

/* ───── Caso 3: LLC → S-corp (conversión y sueldo razonable) ───── */
test('caso 3: el capital previo $20,000 NO se reparte solo entre Common Stock y APIC', () => {
  const sinReparto = conversionEntry({ to: 's_corp', fromAccounts: [{ code: '30000', cents: 2_000_000 }] });
  assert.equal(sinReparto.status, 'pending_split');
  assert.deepEqual(sinReparto.lines, []);
  assert.equal(sinReparto.unallocatedCents, 2_000_000);

  const parcial = conversionEntry({ to: 's_corp', fromAccounts: [{ code: '30000', cents: 2_000_000 }], commonStockCents: 100_000, apicCents: 500_000 });
  assert.equal(parcial.status, 'pending_split');
  assert.equal(parcial.unallocatedCents, 1_400_000);

  const listo = conversionEntry({ to: 's_corp', fromAccounts: [{ code: '30000', cents: 2_000_000 }], commonStockCents: 100_000, apicCents: 1_900_000 });
  assert.equal(listo.status, 'ready');
  assert.deepEqual(listo.lines.map((l) => [l.account, l.debit, l.credit]), [['30000', 2_000_000, 0], ['31000', 0, 100_000], ['31500', 0, 1_900_000]]);
  assert.equal(listo.lines.reduce((s, l) => s + l.debit - l.credit, 0), 0);

  assert.equal(conversionEntry({ to: 'partnership', fromAccounts: [{ code: '31000', cents: 1 }] }).status, 'manual');
});

test('caso 3: S-corp con oficial dueño y sin nómina → alerta de sueldo razonable', () => {
  const owners = [owner('a', 'Miembro', '100', { role: 'member', is_officer: true })];
  const base = { classification: 's_corp' as const, owners, year: 2026, profitCents: 5_000_000 };
  assert.ok(reviewAlerts({ ...base, payrollCents: 0 }).some((a) => a.code === 'S_CORP_OFFICER_NO_PAYROLL'));
  assert.ok(!reviewAlerts({ ...base, payrollCents: 3_600_000 }).some((a) => a.code === 'S_CORP_OFFICER_NO_PAYROLL'));
  assert.ok(!reviewAlerts({ ...base }).some((a) => a.code === 'S_CORP_OFFICER_NO_PAYROLL'), 'nómina desconocida: no se alerta');
  assert.ok(!reviewAlerts({ ...base, classification: 'c_corp', payrollCents: 0 }).some((a) => a.code === 'S_CORP_OFFICER_NO_PAYROLL'));
});

/* ───── Caso 4: S-corp 60/40 con distribuciones 50/50 ───── */
test('caso 4: distribuciones 50/50 en una S-corp 60/40 → alerta de proporción; 60/40 no alerta', () => {
  const owners = [owner('a', 'Accionista A', '60', { role: 'shareholder' }), owner('b', 'Accionista B', '40', { role: 'shareholder' })];
  const base = { classification: 's_corp' as const, owners, year: 2026, profitCents: 20_000_000 };
  const mala = reviewAlerts({ ...base, withdrawals: { a: 5_000_000, b: 5_000_000 } });
  const a = mala.find((x) => x.code === 'DISTRIBUTIONS_NOT_PROPORTIONAL')!;
  assert.ok(a && a.severity === 'warn');
  assert.deepEqual((a.detail!.owners as { expected: number }[]).map((o) => o.expected), [6_000_000, 4_000_000]);
  assert.ok(!reviewAlerts({ ...base, withdrawals: { a: 6_000_000, b: 4_000_000 } }).some((x) => x.code === 'DISTRIBUTIONS_NOT_PROPORTIONAL'));
  // diferencia de centavos por redondeo: dentro de la tolerancia
  assert.ok(!reviewAlerts({ ...base, withdrawals: { a: 6_000_001, b: 3_999_999 } }).some((x) => x.code === 'DISTRIBUTIONS_NOT_PROPORTIONAL'));
  // Solo aplica a S-corp
  assert.ok(!reviewAlerts({ ...base, classification: 'c_corp', withdrawals: { a: 5_000_000, b: 5_000_000 } }).some((x) => x.code === 'DISTRIBUTIONS_NOT_PROPORTIONAL'));
});

test('S-corp: la utilidad va a 32000 y 33000 se cierra contra 32000', () => {
  const owners = [owner('a', 'A', '60', { role: 'shareholder' }), owner('b', 'B', '40', { role: 'shareholder' })];
  const r = closeYear({ classification: 's_corp', owners, year: 2026, profitCents: 20_000_000, withdrawals: { a: 5_000_000, b: 5_000_000 } });
  ok(r);
  assert.deepEqual(r.retainedEarnings, { profit: 20_000_000, distributions: 10_000_000, change: 10_000_000 });
  assert.deepEqual(r.entries.find((e) => e.id === 'distributions')!.lines.map((l) => [l.account, l.debit, l.credit]),
    [['32000', 5_000_000, 0], ['33000', 0, 5_000_000], ['32000', 5_000_000, 0], ['33001', 0, 5_000_000]]);
});

test('C-corp: la utilidad va a 32000 y 34000 Dividends se cierra contra 32000', () => {
  const r = closeYear({ classification: 'c_corp', owners: [owner('a', 'A', '100', { role: 'shareholder' })], year: 2026, profitCents: 1_000_000, withdrawals: { a: 400_000 } });
  ok(r);
  assert.equal(r.retainedEarnings!.change, 600_000);
  assert.ok(r.entries.some((e) => e.lines.some((l) => l.account === '34000')));
  assert.ok(reviewAlerts({ classification: 'c_corp', owners: [owner('a', 'A', '100', { role: 'shareholder' })], year: 2026, profitCents: 0, undocumentedShareholderPayments: 2 })
    .some((a) => a.code === 'DIVIDEND_REVIEW'));
});

/* ───── Caso 5: cambio de % el 01/07, prorrateo por días ───── */
test('caso 5: 50/50 → 70/30 el 01/07 reparte la utilidad por días', () => {
  const owners = [
    owner('a', 'Socia A', '50', { end_date: '2026-06-30' }), owner('b', 'Socio B', '50', { end_date: '2026-06-30' }),
    owner('a', 'Socia A', '70', { start_date: '2026-07-01' }), owner('b', 'Socio B', '30', { start_date: '2026-07-01' }),
  ];
  const w = ownerWeights(owners, '2026-01-01', '2026-12-31');
  assert.deepEqual(w.map((x) => x.weight), [500_000 * 181 + 700_000 * 184, 500_000 * 181 + 300_000 * 184]);
  const profit = 12_000_000; // $120,000.00
  const a = allocateProfit(owners, 2026, '12-31', profit);
  // A: (50×181 + 70×184) / 36,500 = 21,930 / 36,500 = 60.08 %; B: 14,570 / 36,500 = 39.92 %
  assert.deepEqual(a.map((x) => x.cents), [7_209_863, 4_790_137]);
  assert.equal(a[0].cents + a[1].cents, profit);
  assert.ok(a[0].cents > profit * 0.5 && a[0].cents < profit * 0.7, 'entre el 50% y el 70%');
  // Sin cambio de %, es simplemente el %
  assert.deepEqual(allocateProfit([owner('a', 'A', '60'), owner('b', 'B', '40')], 2026, '12-31', 10_000).map((x) => x.cents), [6_000, 4_000]);
  // Se cierra al partnership: cada capital recibe su parte
  const r = closeYear({ classification: 'partnership', owners, year: 2026, profitCents: profit });
  ok(r);
  assert.deepEqual(r.owners.map((o) => o.profit), [7_209_863, 4_790_137]);
});

test('un socio que sale a mitad de año recibe solo los días que fue socio', () => {
  const owners = [owner('a', 'A', '50', { end_date: '2026-06-30' }), owner('b', 'B', '50', { end_date: '2026-06-30' }),
    owner('a', 'A', '100', { start_date: '2026-07-01' })];
  const [a, b] = allocateProfit(owners, 2026, '12-31', 36_500);
  assert.equal(a.cents + b.cents, 36_500);
  assert.equal(b.cents, 9_050); // 181 días al 50% de 365
});

/* ───── Bloqueos y alertas de cierre ───── */
test('retiros sin dueño bloquean el cierre solo con más de un dueño', () => {
  const dos = [owner('a', 'A', '50'), owner('b', 'B', '50')];
  const base = { classification: 'partnership' as const, year: 2026, profitCents: 0 };
  const b = reviewAlerts({ ...base, owners: dos, unassignedCount: 3 }).find((a) => a.code === 'UNASSIGNED_MOVEMENTS')!;
  assert.equal(b.severity, 'error');
  assert.equal(reviewAlerts({ ...base, classification: 'disregarded', owners: [owner('a', 'A', '100', { role: 'owner' })], unassignedCount: 3 }).length, 0);
  assert.equal(reviewAlerts({ ...base, owners: dos, unassignedCount: 0 }).length, 0);
});

test('alertas: capital negativo y retiros mayores que utilidad + capital inicial', () => {
  const owners = [owner('a', 'A', '50'), owner('b', 'B', '50')];
  const closing = closeYear({ classification: 'partnership', owners, year: 2026, profitCents: 1_000_000, openingCapital: { a: 100_000, b: 100_000 }, withdrawals: { a: 900_000, b: 100_000 } });
  const al = reviewAlerts({ classification: 'partnership', owners, year: 2026, profitCents: 1_000_000, openingCapitalTotal: 200_000, withdrawals: { a: 900_000, b: 100_000 }, closing });
  assert.ok(al.some((a) => a.code === 'NEGATIVE_CAPITAL'), 'A: 1,000 + 5,000 − 9,000 = −3,000 → negativo');
  const closing2 = closeYear({ classification: 'partnership', owners, year: 2026, profitCents: 1_000_000, openingCapital: { a: 100_000, b: 100_000 }, withdrawals: { a: 700_000, b: 100_000 } });
  assert.deepEqual(closing2.owners.map((o) => o.ending), [100_000 + 500_000 - 700_000, 100_000 + 500_000 - 100_000]);
  const al2 = reviewAlerts({ classification: 'partnership', owners, year: 2026, profitCents: 1_000_000, openingCapitalTotal: 200_000, withdrawals: { a: 700_000, b: 100_000 }, closing: closing2 });
  assert.ok(al2.some((a) => a.code === 'NEGATIVE_CAPITAL'));
  assert.ok(!al2.some((a) => a.code === 'WITHDRAWALS_EXCEED_PROFIT'));
  const al3 = reviewAlerts({ classification: 'disregarded', owners: [owner('a', 'A', '100', { role: 'owner' })], year: 2026, profitCents: 100_000, openingCapitalTotal: 50_000, withdrawals: { _: 200_000 } });
  assert.ok(al3.some((a) => a.code === 'WITHDRAWALS_EXCEED_PROFIT'));
});
