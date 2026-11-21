export const LEGAL_FORMS = ['sole_prop', 'llc_single', 'llc_multi', 'partnership', 'corporation'] as const;
export const CLASSIFICATIONS = ['disregarded', 'partnership', 's_corp', 'c_corp'] as const;
export const ELECTION_FORMS = ['none', '8832', '2553'] as const;
export const OWNER_ROLES = ['owner', 'member', 'partner', 'shareholder'] as const;
export const HOLDER_TYPES = ['individual', 'entity'] as const;
export const BALANCE_SOURCES = ['QB', 'prior_return', 'statement', 'GNO'] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number];
export type Classification = (typeof CLASSIFICATIONS)[number];
export type ElectionForm = (typeof ELECTION_FORMS)[number];
export type OwnerRole = (typeof OWNER_ROLES)[number];
export type HolderType = (typeof HOLDER_TYPES)[number];
export type BalanceSource = (typeof BALANCE_SOURCES)[number];
export type Lang = 'es' | 'en';

/** 'YYYY-MM-DD' (o '' si está vacío en el formulario) */
export type DateStr = string;

export interface ProfileInput {
  legal_form: LegalForm | '';
  state_of_formation: string;
  formation_date: DateStr;
  fiscal_year_end: string; // MM-DD
  ein_last4: string;
}

export interface ClassInput {
  key: string;
  id?: string;
  classification: Classification | '';
  effective_date: DateStr;
  election_form: ElectionForm;
  election_doc: string;
}

/** Una fila = un tramo de participación de una persona. persona_key identifica a la persona. */
export interface OwnerInput {
  key: string;
  id?: string;
  persona_key: string; // persona_id si existe; si es nueva, un id temporal
  persona_id?: string;
  nombre: string;
  role: OwnerRole;
  holder_type: HolderType;
  ownership_pct: string; // texto: hasta 4 decimales
  start_date: DateStr;
  end_date: DateStr;
  is_officer: boolean;
}

export interface BalanceInput {
  key: string;
  account_code: string;
  account_name: string;
  persona_key: string | null; // dueño del saldo (capital por dueño)
  amount: string;
  source: BalanceSource;
}

export interface EntityState {
  profile: ProfileInput;
  classifications: ClassInput[];
  owners: OwnerInput[];
  as_of: DateStr;
  balances: BalanceInput[];
}

export type Severity = 'error' | 'warn';
export type IssueCode =
  | 'FIELD_REQUIRED' | 'EIN_LAST4_FORMAT' | 'DATE_ORDER' | 'PCT_INVALID' | 'AMOUNT_INVALID' | 'ACCOUNT_CODE_INVALID'
  | 'DUPLICATE_ROW' | 'ID_IN_TEXT'
  | 'ENTITY_MISSING' | 'CLASS_MISSING' | 'CLASS_INVALID_COMBO' | 'ELECTION_DOC_MISSING'
  | 'OWNERS_MISSING' | 'OWNER_PCT_SUM' | 'OWNER_COUNT' | 'OWNER_S_CORP_ENTITY' | 'OFFICER_NOT_APPLICABLE'
  | 'BALANCE_EMPTY' | 'BALANCE_UNBALANCED' | 'BALANCE_OWNER_REQUIRED' | 'BALANCE_ACCOUNT_NOT_IN_TEMPLATE' | 'OPENING_BALANCE_EQUITY'
  | 'DISTRIBUTIONS_NOT_PROPORTIONAL' | 'S_CORP_OFFICER_NO_PAYROLL' | 'NEGATIVE_CAPITAL' | 'WITHDRAWALS_EXCEED_PROFIT'
  | 'UNASSIGNED_MOVEMENTS' | 'DIVIDEND_REVIEW';

export interface Issue {
  step: 1 | 2 | 3 | 4;
  severity: Severity;
  code: IssueCode;
  /** Datos para armar el mensaje (campo, fechas, montos…). Nunca SSN/ITIN. */
  detail?: Record<string, unknown>;
  /** Fila o campo al que apunta, para resaltarlo en pantalla. */
  ref?: string;
}
