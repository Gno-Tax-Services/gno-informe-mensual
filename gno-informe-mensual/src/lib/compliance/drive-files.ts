import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// Escritura en Google Drive para el Centro de Cumplimiento.
// Los archivos viven en Drive (GNO Clients); la base de datos guarda solo
// la referencia. Los service accounts no tienen cuota propia en "Mi unidad",
// así que se usa una de estas dos opciones:
//   A) GOOGLE_DRIVE_IMPERSONATE=<correo Workspace> con delegación de dominio
//      (los archivos quedan a nombre de ese usuario), o
//   B) la carpeta raíz dentro de una Unidad compartida con el service account
//      como "Gestor de contenido".
// GNO_DRIVE_CLIENTS_FOLDER_ID = id de la carpeta "GNO Clients".
// ─────────────────────────────────────────────────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isDriveWriteConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GNO_DRIVE_CLIENTS_FOLDER_ID);
}

function client() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
  return google.drive({ version: 'v3', auth });
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Busca o crea la ruta de carpetas bajo GNO Clients. Devuelve id y url. */
export async function ensureFolderPath(segments: string[]): Promise<{ id: string; url: string; ubicacion: string }> {
  const drive = client();
  let parent = process.env.GNO_DRIVE_CLIENTS_FOLDER_ID!;
  for (const raw of segments) {
    const name = raw.trim();
    if (!name) continue;
    const found = await drive.files.list({
      q: `'${parent}' in parents and mimeType='${FOLDER_MIME}' and trashed=false and name='${esc(name)}'`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const id = found.data.files?.[0]?.id;
    if (id) { parent = id; continue; }
    const created = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parent] },
      fields: 'id',
      supportsAllDrives: true,
    });
    parent = created.data.id!;
  }
  return {
    id: parent,
    url: `https://drive.google.com/drive/folders/${parent}`,
    ubicacion: ['GNO Clients', ...segments].join(' > '),
  };
}

export interface UploadedFile {
  drive_file_id: string;
  drive_url: string;
  nombre: string;
  mime: string;
  bytes: number;
  sha256: string;
}

/** Sube un archivo a una carpeta de Drive. Si ya hay uno con el mismo nombre, crea una versión nueva. */
export async function uploadFile(folderId: string, nombre: string, mime: string, data: Buffer): Promise<UploadedFile> {
  const drive = client();
  const sha256 = createHash('sha256').update(data).digest('hex');
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name='${esc(nombre)}'`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const media = { mimeType: mime, body: Readable.from(data) };
  const prevId = existing.data.files?.[0]?.id;
  const res = prevId
    ? await drive.files.update({ fileId: prevId, media, fields: 'id, webViewLink', supportsAllDrives: true })
    : await drive.files.create({
        requestBody: { name: nombre, parents: [folderId] },
        media,
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });
  return {
    drive_file_id: res.data.id!,
    drive_url: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    nombre,
    mime,
    bytes: data.length,
    sha256,
  };
}

/** Lee los metadatos de un archivo que ya está en Drive (para registrarlo sin subirlo). */
export async function fileMetadata(fileId: string): Promise<UploadedFile & { parent: string | null }> {
  const drive = client();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, sha256Checksum, webViewLink, parents',
    supportsAllDrives: true,
  });
  const f = res.data;
  return {
    drive_file_id: f.id!,
    drive_url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    nombre: f.name!,
    mime: f.mimeType || 'application/octet-stream',
    bytes: Number(f.size || 0),
    sha256: (f as any).sha256Checksum || '',
    parent: f.parents?.[0] ?? null,
  };
}
