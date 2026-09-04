import Anthropic from '@anthropic-ai/sdk';

// ─────────────────────────────────────────────────────────────
// Genera el guion (script) del video mensual con Claude API.
// Reglas del proyecto GNO codificadas en el system prompt:
//  - NUNCA mencionar Professional Fees / Accounting Fees / CPA Fees.
//  - Credencial a usar si se firma: "Accountants MBA / CAA".
// El guion es texto plano listo para narrar en HeyGen (~150-220 palabras).
// ─────────────────────────────────────────────────────────────

export function isNarrativeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type NarrativeInput = {
  nombreDueno: string;
  nombreCompania: string;
  industria?: string | null;
  periodo: string;
  totalIncome: number | null;
  totalCogs: number | null;
  grossProfit: number | null;
  totalExpenses: number | null;
  netIncome: number | null;
  profitMargin: number | null;
  profitabilityBand?: string | null; // BELOW_AVERAGE | WITHIN_AVERAGE | ABOVE_AVERAGE
};

const SYSTEM_PROMPT = `Eres Jeiver, contador de GNO Tax & Business Center LLC en New Orleans, LA.
Escribes el guion de un video mensual, corto y personalizado, para explicarle a un cliente sus resultados financieros del mes de forma cálida, clara y motivadora.

REGLAS ESTRICTAS:
- NUNCA menciones honorarios, "Professional Fees", "Accounting Fees", "CPA Fees" ni cobros de contabilidad.
- No inventes cifras: usa solo los números que te den.
- Habla en segunda persona, dirigiéndote al dueño por su nombre.
- Explica los números en lenguaje sencillo (sin jerga contable pesada).
- Tono humano y cercano, en español.
- Longitud: entre 150 y 220 palabras (para un video de ~1 a 1.5 min).
- Cierra invitando a agendar una llamada para revisar los resultados juntos.
- Si firmas o te presentas, usa la credencial "Accountants MBA / CAA".
- Devuelve ÚNICAMENTE el texto del guion, sin encabezados, sin acotaciones de escena, sin comillas.`;

function bandTexto(band?: string | null): string {
  switch (band) {
    case 'ABOVE_AVERAGE':
      return 'por encima del promedio de su industria';
    case 'BELOW_AVERAGE':
      return 'por debajo del promedio de su industria';
    case 'WITHIN_AVERAGE':
      return 'dentro del promedio de su industria';
    default:
      return 'sin comparación de industria disponible';
  }
}

export async function generateNarrative(input: NarrativeInput): Promise<string> {
  const client = new Anthropic(); // usa ANTHROPIC_API_KEY del entorno

  const money = (n: number | null) =>
    n === null || n === undefined ? 'N/D' : `$${Number(n).toLocaleString('en-US')}`;

  const userContent = `Datos del cliente y su mes:
- Dueño: ${input.nombreDueno}
- Compañía: ${input.nombreCompania}
- Industria: ${input.industria || 'no especificada'}
- Periodo: ${input.periodo}
- Ingresos totales: ${money(input.totalIncome)}
- Costo de ventas (COGS): ${money(input.totalCogs)}
- Utilidad bruta: ${money(input.grossProfit)}
- Gastos operativos: ${money(input.totalExpenses)}
- Utilidad neta: ${money(input.netIncome)}
- Margen neto: ${input.profitMargin ?? 'N/D'}%
- Desempeño: ${bandTexto(input.profitabilityBand)}

Escribe el guion del video para ${input.nombreDueno} sobre ${input.nombreCompania} en ${input.periodo}.`;

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2000,
    // Tarea acotada: 'medium' equilibra calidad, costo y latencia (serverless).
    output_config: { effort: 'medium' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return text;
}
