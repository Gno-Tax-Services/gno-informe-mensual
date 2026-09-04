import { google } from 'googleapis';

// ─────────────────────────────────────────────────────────────
// Envío de correos como la cuenta remitente de GNO (jgonzalez@gnotbc.com).
//
// Usa un REFRESH TOKEN dedicado (GMAIL_SENDER_REFRESH_TOKEN), NO el token del
// usuario que inicia sesión. Así el login solo necesita scopes básicos y no
// dispara el muro de verificación de Google por el scope restringido gmail.send.
//
// Cómo generar el refresh token (una sola vez), con un cliente OAuth que tenga
// el scope https://www.googleapis.com/auth/gmail.send y la cuenta remitente:
//   https://developers.google.com/oauthplayground  (o un script propio)
// Guarda el refresh_token resultante en Vercel como GMAIL_SENDER_REFRESH_TOKEN.
// ─────────────────────────────────────────────────────────────

export function isGmailSenderConfigured(): boolean {
  return Boolean(process.env.GMAIL_SENDER_REFRESH_TOKEN);
}

function getSenderClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );
  client.setCredentials({
    refresh_token: process.env.GMAIL_SENDER_REFRESH_TOKEN,
  });
  return client;
}

export async function sendEmailViaGmail(
  to: string,
  subject: string,
  htmlBody: string
) {
  const auth = getSenderClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const fromName = 'GNO Tax & Business Center';
  const fromEmail = process.env.GNO_FROM_EMAIL!;
  // GNO_REPLY_TO es opcional; si no está definido, se responde al remitente.
  const replyTo = process.env.GNO_REPLY_TO || fromEmail;

  const messageParts = [
    `From: "${fromName}" <${fromEmail}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];

  const message = messageParts.join('\n');
  const encoded = Buffer.from(message).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return res.data;
}
