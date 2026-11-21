/** Constructores de estado para pruebas y para el modo demo. Todo ficticio. */
import type { BalanceInput, ClassInput, EntityState, OwnerInput, ProfileInput } from './types';

let n = 0;
const k = (p: string) => `${p}${++n}`;

export const profile = (legal_form: ProfileInput['legal_form'], over: Partial<ProfileInput> = {}): ProfileInput => ({
  legal_form, state_of_formation: 'LA', formation_date: '2020-01-01', fiscal_year_end: '12-31', ein_last4: '', ...over,
});

export const cls = (classification: ClassInput['classification'], effective_date: string, over: Partial<ClassInput> = {}): ClassInput => ({
  key: k('c'), classification, effective_date, election_form: classification === 's_corp' ? '2553' : 'none',
  election_doc: classification === 's_corp' ? 'GNO Clients/Carta IRS.pdf' : '', ...over,
});

export const owner = (persona_key: string, nombre: string, pct: string, over: Partial<OwnerInput> = {}): OwnerInput => ({
  key: k('o'), persona_key, nombre, role: 'partner', holder_type: 'individual', ownership_pct: pct,
  start_date: '2020-01-01', end_date: '', is_officer: false, ...over,
});

export const bal = (account_code: string, amount: string, persona_key: string | null = null, over: Partial<BalanceInput> = {}): BalanceInput => ({
  key: k('b'), account_code, account_name: '', persona_key, amount, source: 'GNO', ...over,
});

export const state = (p: ProfileInput, classifications: ClassInput[], owners: OwnerInput[], as_of = '', balances: BalanceInput[] = []): EntityState => ({
  profile: p, classifications, owners, as_of, balances,
});
