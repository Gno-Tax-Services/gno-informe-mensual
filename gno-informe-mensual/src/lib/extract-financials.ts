import Anthropic from '@anthropic-ai/sdk';

// ─────────────────────────────────────────────────────────────
// Extrae las métricas de un P&L (PDF) usando Claude (document API).
// El P&L es ACUMULADO al mes (YTD), así que devolvemos los totales acumulados.
// ─────────────────────────────────────────────────────────────

export type ExtractedFinancials = {
  totalIncome: number | null;
  totalCogs: number | null;
  grossProfit: number | null;
  totalExpenses: number | null;
  netIncome: number | null;
};

const SYSTEM = `Eres un contador experto en leer estados de resultados (Profit & Loss / P&L).
Recibes un PDF de un P&L ACUMULADO al periodo indicado. Extrae los TOTALES acumulados.
Reglas:
- Devuelve montos como números (sin símbolos, sin comas, sin paréntesis). Pérdidas = número negativo.
- Usa las líneas de total: Total Income/Revenue, Total COGS/Cost of Goods Sold, Gross Profit,
  Total Expenses/Operating Expenses, Net Income/Net Profit (o Net Operating Income).
- Si una línea no existe en el PDF, usa null.
- Responde ÚNICAMENTE con un objeto JSON, sin texto adicional ni bloques de código.`;

function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function extractFinancialsFromPdf(
  base64Pdf: string,
  periodo: string
): Promise<ExtractedFinancials> {
  const client = new Anthropic();

  const res = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
          },
          {
            type: 'text',
            text: `Este es el P&L acumulado a ${periodo}. Extrae los totales y responde SOLO con este JSON:
{"total_income":<num|null>,"total_cogs":<num|null>,"gross_profit":<num|null>,"total_expenses":<num|null>,"net_income":<num|null>}`,
          },
        ],
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Aísla el JSON aunque venga con texto o fences.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Claude no devolvió JSON legible: ${text.slice(0, 200)}`);
  }
  const raw = JSON.parse(match[0]);

  return {
    totalIncome: num(raw.total_income),
    totalCogs: num(raw.total_cogs),
    grossProfit: num(raw.gross_profit),
    totalExpenses: num(raw.total_expenses),
    netIncome: num(raw.net_income),
  };
}
