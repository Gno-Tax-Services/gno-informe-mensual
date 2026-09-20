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
  idioma?: string | null;
  periodo: string;
  totalIncome: number | null;
  totalCogs: number | null;
  grossProfit: number | null;
  totalExpenses: number | null;
  netIncome: number | null;
  profitMargin: number | null;
  profitabilityBand?: string | null;
};

type LangConfig = {
  systemPrompt: string;
  bandText: Record<string, string>;
  defaultBand: string;
};

const LANG: Record<string, LangConfig> = {
  es: {
    systemPrompt: `Eres Jeiver, contador de GNO Tax & Business Center LLC en New Orleans, LA.
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
- Devuelve ÚNICAMENTE el texto del guion, sin encabezados, sin acotaciones de escena, sin comillas.`,
    bandText: {
      ABOVE_AVERAGE: 'por encima del promedio de su industria',
      BELOW_AVERAGE: 'por debajo del promedio de su industria',
      WITHIN_AVERAGE: 'dentro del promedio de su industria',
    },
    defaultBand: 'sin comparación de industria disponible',
  },
  en: {
    systemPrompt: `You are Jeiver, an accountant at GNO Tax & Business Center LLC in New Orleans, LA.
You write the script for a short, personalized monthly video to explain a client's financial results in a warm, clear, and motivating way.

STRICT RULES:
- NEVER mention fees, "Professional Fees", "Accounting Fees", "CPA Fees" or any accounting charges.
- Do not make up numbers: only use the figures provided.
- Speak in second person, addressing the owner by name.
- Explain the numbers in plain language (no heavy accounting jargon).
- Warm and friendly tone, in English.
- Length: between 150 and 220 words (for a ~1 to 1.5 min video).
- Close by inviting them to schedule a call to review the results together.
- If you sign or introduce yourself, use the credential "Accountants MBA / CAA".
- Return ONLY the script text, no headings, no stage directions, no quotes.`,
    bandText: {
      ABOVE_AVERAGE: 'above the industry average',
      BELOW_AVERAGE: 'below the industry average',
      WITHIN_AVERAGE: 'within the industry average',
    },
    defaultBand: 'no industry comparison available',
  },
  fr: {
    systemPrompt: `Vous êtes Jeiver, comptable chez GNO Tax & Business Center LLC à New Orleans, LA.
Vous rédigez le script d'une courte vidéo mensuelle personnalisée pour expliquer les résultats financiers d'un client de manière chaleureuse, claire et motivante.

RÈGLES STRICTES:
- Ne JAMAIS mentionner les honoraires, "Professional Fees", "Accounting Fees", "CPA Fees" ni aucun frais comptable.
- N'inventez pas de chiffres : utilisez uniquement les données fournies.
- Parlez à la deuxième personne, en vous adressant au propriétaire par son nom.
- Expliquez les chiffres dans un langage simple (sans jargon comptable lourd).
- Ton chaleureux et amical, en français.
- Longueur : entre 150 et 220 mots (pour une vidéo de ~1 à 1,5 min).
- Terminez en invitant à planifier un appel pour revoir les résultats ensemble.
- Si vous signez ou vous présentez, utilisez le titre "Accountants MBA / CAA".
- Retournez UNIQUEMENT le texte du script, sans titres, sans indications scéniques, sans guillemets.`,
    bandText: {
      ABOVE_AVERAGE: 'au-dessus de la moyenne du secteur',
      BELOW_AVERAGE: 'en dessous de la moyenne du secteur',
      WITHIN_AVERAGE: 'dans la moyenne du secteur',
    },
    defaultBand: 'aucune comparaison sectorielle disponible',
  },
  pt: {
    systemPrompt: `Você é Jeiver, contador na GNO Tax & Business Center LLC em New Orleans, LA.
Você escreve o roteiro de um vídeo mensal curto e personalizado para explicar os resultados financeiros de um cliente de forma calorosa, clara e motivadora.

REGRAS ESTRITAS:
- NUNCA mencione honorários, "Professional Fees", "Accounting Fees", "CPA Fees" ou cobranças contábeis.
- Não invente números: use apenas os dados fornecidos.
- Fale na segunda pessoa, dirigindo-se ao proprietário pelo nome.
- Explique os números em linguagem simples (sem jargão contábil pesado).
- Tom humano e próximo, em português.
- Comprimento: entre 150 e 220 palavras (para um vídeo de ~1 a 1,5 min).
- Encerre convidando a agendar uma ligação para revisar os resultados juntos.
- Se assinar ou se apresentar, use a credencial "Accountants MBA / CAA".
- Retorne APENAS o texto do roteiro, sem cabeçalhos, sem indicações de cena, sem aspas.`,
    bandText: {
      ABOVE_AVERAGE: 'acima da média do setor',
      BELOW_AVERAGE: 'abaixo da média do setor',
      WITHIN_AVERAGE: 'dentro da média do setor',
    },
    defaultBand: 'sem comparação setorial disponível',
  },
};

function normalizeLang(idioma?: string | null): string {
  const raw = (idioma || 'espanol').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (raw.startsWith('en') || raw.startsWith('in')) return 'en';
  if (raw.startsWith('fr') || raw.startsWith('fran')) return 'fr';
  if (raw.startsWith('pt') || raw.startsWith('por')) return 'pt';
  return 'es';
}

function bandTexto(band: string | null | undefined, lang: LangConfig): string {
  if (band && lang.bandText[band]) return lang.bandText[band];
  return lang.defaultBand;
}

export async function generateNarrative(input: NarrativeInput): Promise<string> {
  const client = new Anthropic();

  const langCode = normalizeLang(input.idioma);
  const lang = LANG[langCode];

  const money = (n: number | null) =>
    n === null || n === undefined ? 'N/A' : `$${Number(n).toLocaleString('en-US')}`;

  const userContent = `Client data for this month:
- Owner: ${input.nombreDueno}
- Company: ${input.nombreCompania}
- Industry: ${input.industria || 'not specified'}
- Period: ${input.periodo}
- Total income: ${money(input.totalIncome)}
- Cost of goods sold (COGS): ${money(input.totalCogs)}
- Gross profit: ${money(input.grossProfit)}
- Operating expenses: ${money(input.totalExpenses)}
- Net income: ${money(input.netIncome)}
- Net margin: ${input.profitMargin ?? 'N/A'}%
- Performance: ${bandTexto(input.profitabilityBand, lang)}

Write the video script for ${input.nombreDueno} about ${input.nombreCompania} for ${input.periodo}.`;

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2000,
    output_config: { effort: 'medium' },
    system: lang.systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return text;
}
