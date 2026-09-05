import { google } from 'googleapis';

// ─────────────────────────────────────────────────────────────
// Lectura de Google Drive / Sheets con un SERVICE ACCOUNT.
// La llave JSON del service account va en la env GOOGLE_SERVICE_ACCOUNT_JSON
// (todo el JSON como string). Comparte la carpeta "05 - Financials" y el
// Client List con el correo del service account (como Lector).
// ─────────────────────────────────────────────────────────────

// Carpeta raíz de financieros (05 - Financials). Configurable por env.
const FINANCIALS_FOLDER_ID =
  process.env.GNO_DRIVE_FINANCIALS_FOLDER_ID || '1aV7K8wTghgLurXudnVqCqonJqBKaJDH2';

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  let creds: any;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido');
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });
}

function driveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// Escapa comillas simples para las queries de Drive.
function q(s: string) {
  return s.replace(/'/g, "\\'");
}

// Busca una subcarpeta por nombre dentro de un folder padre.
async function findSubfolder(parentId: string, name: string): Promise<string | null> {
  const drive = driveClient();
  // Intenta nombre exacto y "<name> Folder" (así están tus carpetas de mes).
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and (name='${q(
      name
    )}' or name='${q(name)} Folder')`,
    fields: 'files(id,name)',
    pageSize: 10,
  });
  return res.data.files?.[0]?.id ?? null;
}

// Busca el PDF del P&L dentro de un folder (por nombre que contenga P&L / PnL).
async function findPnLInFolder(folderId: string): Promise<{ id: string; name: string } | null> {
  const drive = driveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false and (name contains 'P&L' or name contains 'PnL' or name contains 'P and L' or name contains 'Profit')`,
    fields: 'files(id,name)',
    pageSize: 10,
  });
  const f = res.data.files?.[0];
  return f?.id ? { id: f.id, name: f.name! } : null;
}

/**
 * Ubica el P&L (PDF) de una empresa para un mes dado.
 * Convención: 05-Financials / "<monthLabel> Folder" / "<company>" / *P&L*.pdf
 * Fallback (para pruebas): si no hay subcarpeta por empresa, busca un P&L
 * directamente dentro del folder del mes.
 */
export async function findCompanyPnL(
  company: string,
  monthLabel: string
): Promise<{ id: string; name: string }> {
  const monthFolderId = await findSubfolder(FINANCIALS_FOLDER_ID, monthLabel);
  if (!monthFolderId) {
    throw new Error(`No encontré la carpeta del mes "${monthLabel}" en 05 - Financials.`);
  }

  const companyFolderId = await findSubfolder(monthFolderId, company);
  if (companyFolderId) {
    const pnl = await findPnLInFolder(companyFolderId);
    if (pnl) return pnl;
    throw new Error(`No encontré un PDF de P&L en la carpeta de "${company}".`);
  }

  // Fallback: P&L directamente en el folder del mes (para pruebas tipo "2025 Folder").
  const direct = await findPnLInFolder(monthFolderId);
  if (direct) return direct;

  throw new Error(
    `No encontré la subcarpeta "${company}" ni un P&L en "${monthLabel}". Revisa la convención de carpetas.`
  );
}

// Descarga un PDF de Drive y lo devuelve en base64 (para enviarlo a Claude).
export async function downloadPdfBase64(fileId: string): Promise<string> {
  const drive = driveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer).toString('base64');
}

export type DriveClient = {
  compania: string;
  nombre: string;
  email: string;
  telefono: string;
  idioma: string;
};

// Lee el Google Sheet "Client List" y devuelve las filas mapeadas por encabezado.
export async function readClientList(spreadsheetId: string): Promise<DriveClient[]> {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:Z1000',
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => String(h).toLowerCase().trim());
  const idx = (aliases: string[]) =>
    header.findIndex((h) => aliases.some((a) => h.includes(a)));

  const ci = {
    compania: idx(['compañía', 'compania', 'company']),
    nombre: idx(['nombre', 'name', 'cliente', 'client']),
    email: idx(['correo', 'email', 'e-mail']),
    telefono: idx(['teléfono', 'telefono', 'phone', 'whatsapp']),
    idioma: idx(['idioma', 'language', 'lang']),
  };

  return rows.slice(1).map((r) => ({
    compania: (r[ci.compania] ?? '').toString().trim(),
    nombre: (r[ci.nombre] ?? '').toString().trim(),
    email: (r[ci.email] ?? '').toString().trim(),
    telefono: (r[ci.telefono] ?? '').toString().trim(),
    idioma: (r[ci.idioma] ?? '').toString().trim(),
  })).filter((c) => c.compania || c.email);
}
