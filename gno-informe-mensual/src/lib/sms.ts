const TWILIO_API = 'https://api.twilio.com/2010-04-01';

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

export async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || `Twilio error ${res.status}`);
  }
  return data.sid as string;
}

const SMS_TEMPLATES: Record<string, (nombre: string) => string> = {
  es: (nombre) =>
    `Hola ${nombre}, le enviamos un email con un video importante de GNO Tax & Business Center. Por favor revise su bandeja de entrada (o spam). Gracias!`,
  en: (nombre) =>
    `Hi ${nombre}, we sent you an email with an important video from GNO Tax & Business Center. Please check your inbox (or spam folder). Thank you!`,
  fr: (nombre) =>
    `Bonjour ${nombre}, nous vous avons envoyé un email avec une vidéo importante de GNO Tax & Business Center. Veuillez vérifier votre boîte de réception (ou spam). Merci!`,
  pt: (nombre) =>
    `Olá ${nombre}, enviamos um email com um vídeo importante da GNO Tax & Business Center. Por favor verifique sua caixa de entrada (ou spam). Obrigado!`,
};

export function getReminderMessage(nombre: string, idioma?: string | null): string {
  const lang = normalizeLang(idioma);
  const template = SMS_TEMPLATES[lang] || SMS_TEMPLATES.es;
  return template(nombre);
}

function normalizeLang(idioma?: string | null): string {
  const raw = (idioma || 'espanol').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (raw.startsWith('en') || raw.startsWith('in')) return 'en';
  if (raw.startsWith('fr') || raw.startsWith('fran')) return 'fr';
  if (raw.startsWith('pt') || raw.startsWith('por')) return 'pt';
  return 'es';
}
