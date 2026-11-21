/**
 * Casos 2 a 5 de la spec para el modo DEMO. TODO es ficticio.
 * Los ids deben coincidir con supabase/seed/demo.sql (hay una prueba que lo verifica).
 * El caso 1 (piloto real) NO está aquí: el modo demo nunca contiene datos reales.
 */
export const DEMO_CLIENTS = {
  sole: 'd0000000-0000-4000-8000-000000000007',        // caso 2
  llcToS: 'd0000000-0000-4000-8000-000000000008',      // caso 3
  sCorp: 'd0000000-0000-4000-8000-000000000009',       // caso 4
  partnership: 'd0000000-0000-4000-8000-000000000010', // caso 5
} as const;

export const DEMO_PERSONAS = {
  marie: 'd1000000-0000-4000-8000-000000000007',
  theo: 'd1000000-0000-4000-8000-000000000008',
  lena: 'd1000000-0000-4000-8000-000000000009',
  marcus: 'd1000000-0000-4000-8000-000000000010',
  nora: 'd1000000-0000-4000-8000-000000000011',
  remy: 'd1000000-0000-4000-8000-000000000012',
} as const;

export interface DemoScenario {
  caseNo: 2 | 3 | 4 | 5;
  year: number;
  profitCents: number;
  /** Capital al inicio del año por persona (centavos). */
  openingCapital: Record<string, number>;
  contributions?: Record<string, number>;
  withdrawals: Record<string, number>;
  /** Sueldos en nómina del año (0 = sin nómina). */
  payrollCents?: number;
  /** Caso 3: capital previo que pasa de 30000 a Common Stock/APIC según GNO. */
  conversion?: { date: string; capitalCents: number };
}

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  // Caso 2 — sole proprietor: aportes y retiros del único dueño
  [DEMO_CLIENTS.sole]: {
    caseNo: 2, year: 2026, profitCents: 8_500_000,
    openingCapital: { [DEMO_PERSONAS.marie]: 1_000_000 },
    contributions: { [DEMO_PERSONAS.marie]: 500_000 },
    withdrawals: { [DEMO_PERSONAS.marie]: 4_000_000 },
  },
  // Caso 3 — LLC de un miembro que elige S-corp el 01/01/2026 con capital previo de $20,000
  [DEMO_CLIENTS.llcToS]: {
    caseNo: 3, year: 2026, profitCents: 5_500_000,
    openingCapital: { [DEMO_PERSONAS.theo]: 2_000_000 },
    withdrawals: { [DEMO_PERSONAS.theo]: 1_500_000 },
    payrollCents: 0,
    conversion: { date: '2026-01-01', capitalCents: 2_000_000 },
  },
  // Caso 4 — S-corp 60/40 con distribuciones 50/50
  [DEMO_CLIENTS.sCorp]: {
    caseNo: 4, year: 2026, profitCents: 20_000_000,
    openingCapital: {},
    withdrawals: { [DEMO_PERSONAS.lena]: 5_000_000, [DEMO_PERSONAS.marcus]: 5_000_000 },
    payrollCents: 6_000_000,
  },
  // Caso 5 — partnership con cambio de % el 01/07 (50/50 → 70/30)
  [DEMO_CLIENTS.partnership]: {
    caseNo: 5, year: 2026, profitCents: 12_000_000,
    openingCapital: { [DEMO_PERSONAS.nora]: 2_500_000, [DEMO_PERSONAS.remy]: 2_500_000 },
    withdrawals: { [DEMO_PERSONAS.nora]: 3_000_000, [DEMO_PERSONAS.remy]: 2_000_000 },
  },
};

export const demoScenarioFor = (clientId: string): DemoScenario | null => DEMO_SCENARIOS[clientId] ?? null;
