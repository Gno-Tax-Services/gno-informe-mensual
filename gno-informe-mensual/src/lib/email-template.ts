interface ReportEmailVars {
  nombre: string;
  compania: string;
  periodo: string;
  videoUrl: string;
  magicToken: string;
  idioma?: string | null;
}

type EmailStrings = {
  lang: string;
  title: string;
  badge: string;
  salutation: string;
  intro: string;
  basis: string;
  ctaIntro: string;
  ctaBtn: string;
  ctaSub: string;
  discTitle: string;
  discText: (compania: string) => string;
  consultBtn: string;
  footerWeb: string;
  footerCal: string;
  footerContact: string;
  subject: string;
};

function normalizeLang(idioma?: string | null): string {
  const raw = (idioma || 'espanol').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (raw.startsWith('en') || raw.startsWith('in')) return 'en';
  if (raw.startsWith('fr') || raw.startsWith('fran')) return 'fr';
  if (raw.startsWith('pt') || raw.startsWith('por')) return 'pt';
  return 'es';
}

const EMAIL_LANG: Record<string, EmailStrings> = {
  es: {
    lang: 'es',
    title: 'Informe Financiero Mensual',
    badge: 'Informe Financiero Mensual',
    salutation: 'Estimado/a',
    intro: 'En GNO Tax &amp; Business Center nos comprometemos a mantenerle informado sobre la salud financiera de su empresa de manera clara, oportuna y profesional. Nos complace presentarle el informe financiero correspondiente al periodo de',
    basis: 'Los estados financieros han sido preparados bajo el método de <strong>contabilidad de caja (Cash Basis)</strong>, conforme a los Principios de Contabilidad Generalmente Aceptados (U.S. GAAP) aplicables a entidades de base efectivo, utilizando los registros contables suministrados a GNO Tax &amp; Business Center durante el periodo indicado.',
    ctaIntro: 'Haga clic en el botón a continuación para acceder a su informe personalizado con el análisis de resultados explicado por nuestro equipo:',
    ctaBtn: 'Ver mi Informe Financiero',
    ctaSub: 'Acceso privado y seguro',
    discTitle: 'Alcance Profesional y Limitaciones — Aviso Importante',
    discText: (c) => `Este informe ha sido preparado exclusivamente con fines informativos y de gestión interna para <strong>${c}</strong>. <strong>No constituye asesoría tributaria formal ni una opinión fiscal bajo el Internal Revenue Code (IRC)</strong> y no debe interpretarse como tal conforme a las Circular 230 Regulations del IRS. Los resultados financieros aquí presentados reflejan las transacciones registradas en el periodo indicado bajo el método de contabilidad de caja y pueden estar sujetos a ajustes fiscales adicionales requeridos por el IRC, incluyendo entre otros: ajustes por diferencias temporales, deducciones sujetas a limitación (§179, §163(j), §461(l)) y créditos tributarios aplicables. Este documento no representa una auditoría, revisión ni compilación bajo los estándares de SSARS. Para orientación específica sobre su situación tributaria, le invitamos a programar una consulta con nuestro equipo profesional.<br><br><strong>Confidencialidad:</strong> La información contenida en este mensaje y sus adjuntos es confidencial, de uso exclusivo del destinatario y está protegida bajo las normas de confidencialidad de cliente-contador aplicables en el Estado de Louisiana. Si usted no es el destinatario autorizado, por favor elimine este mensaje y notifique al remitente de inmediato.`,
    consultBtn: 'Agendar Consulta con su Contador',
    footerWeb: 'Sitio Web',
    footerCal: 'Agendar Cita',
    footerContact: 'Contacto',
    subject: 'Informe Financiero',
  },
  en: {
    lang: 'en',
    title: 'Monthly Financial Report',
    badge: 'Monthly Financial Report',
    salutation: 'Dear',
    intro: 'At GNO Tax &amp; Business Center, we are committed to keeping you informed about the financial health of your business in a clear, timely, and professional manner. We are pleased to present the financial report for the period of',
    basis: 'The financial statements have been prepared under the <strong>Cash Basis of Accounting</strong>, in accordance with U.S. Generally Accepted Accounting Principles (U.S. GAAP) applicable to cash-basis entities, using the accounting records provided to GNO Tax &amp; Business Center during the indicated period.',
    ctaIntro: 'Click the button below to access your personalized report with results analysis explained by our team:',
    ctaBtn: 'View my Financial Report',
    ctaSub: 'Private and secure access',
    discTitle: 'Professional Scope and Limitations — Important Notice',
    discText: (c) => `This report has been prepared exclusively for informational and internal management purposes for <strong>${c}</strong>. <strong>It does not constitute formal tax advice or a tax opinion under the Internal Revenue Code (IRC)</strong> and should not be interpreted as such under the IRS Circular 230 Regulations. The financial results presented herein reflect transactions recorded during the indicated period under the cash basis of accounting and may be subject to additional tax adjustments required by the IRC, including but not limited to: timing difference adjustments, deductions subject to limitation (§179, §163(j), §461(l)), and applicable tax credits. This document does not represent an audit, review, or compilation under SSARS standards. For specific guidance on your tax situation, we invite you to schedule a consultation with our professional team.<br><br><strong>Confidentiality:</strong> The information contained in this message and its attachments is confidential, for the exclusive use of the recipient, and is protected under the client-accountant confidentiality rules applicable in the State of Louisiana. If you are not the authorized recipient, please delete this message and notify the sender immediately.`,
    consultBtn: 'Schedule a Consultation with your Accountant',
    footerWeb: 'Website',
    footerCal: 'Schedule Appointment',
    footerContact: 'Contact',
    subject: 'Financial Report',
  },
  fr: {
    lang: 'fr',
    title: 'Rapport Financier Mensuel',
    badge: 'Rapport Financier Mensuel',
    salutation: 'Cher/Chère',
    intro: 'Chez GNO Tax &amp; Business Center, nous nous engageons à vous tenir informé de la santé financière de votre entreprise de manière claire, opportune et professionnelle. Nous avons le plaisir de vous présenter le rapport financier correspondant à la période de',
    basis: 'Les états financiers ont été préparés selon la méthode de <strong>comptabilité de caisse (Cash Basis)</strong>, conformément aux Principes Comptables Généralement Acceptés aux États-Unis (U.S. GAAP) applicables aux entités à base de trésorerie, en utilisant les registres comptables fournis à GNO Tax &amp; Business Center durant la période indiquée.',
    ctaIntro: 'Cliquez sur le bouton ci-dessous pour accéder à votre rapport personnalisé avec l\'analyse des résultats expliquée par notre équipe :',
    ctaBtn: 'Voir mon Rapport Financier',
    ctaSub: 'Accès privé et sécurisé',
    discTitle: 'Portée Professionnelle et Limitations — Avis Important',
    discText: (c) => `Ce rapport a été préparé exclusivement à des fins informatives et de gestion interne pour <strong>${c}</strong>. <strong>Il ne constitue pas un conseil fiscal formel ni un avis fiscal en vertu de l'Internal Revenue Code (IRC)</strong> et ne doit pas être interprété comme tel conformément aux réglementations Circular 230 de l'IRS. Les résultats financiers présentés reflètent les transactions enregistrées au cours de la période indiquée selon la méthode de comptabilité de caisse et peuvent être soumis à des ajustements fiscaux supplémentaires. Ce document ne représente ni un audit, ni une revue, ni une compilation selon les normes SSARS. Pour des conseils spécifiques sur votre situation fiscale, nous vous invitons à planifier une consultation avec notre équipe professionnelle.<br><br><strong>Confidentialité :</strong> Les informations contenues dans ce message et ses pièces jointes sont confidentielles, à l'usage exclusif du destinataire et sont protégées par les règles de confidentialité client-comptable applicables dans l'État de Louisiane. Si vous n'êtes pas le destinataire autorisé, veuillez supprimer ce message et en informer l'expéditeur immédiatement.`,
    consultBtn: 'Planifier une Consultation avec votre Comptable',
    footerWeb: 'Site Web',
    footerCal: 'Prendre Rendez-vous',
    footerContact: 'Contact',
    subject: 'Rapport Financier',
  },
  pt: {
    lang: 'pt',
    title: 'Relatório Financeiro Mensal',
    badge: 'Relatório Financeiro Mensal',
    salutation: 'Prezado/a',
    intro: 'Na GNO Tax &amp; Business Center, estamos comprometidos em mantê-lo informado sobre a saúde financeira de sua empresa de maneira clara, oportuna e profissional. Temos o prazer de apresentar o relatório financeiro correspondente ao período de',
    basis: 'As demonstrações financeiras foram preparadas pelo método de <strong>contabilidade de caixa (Cash Basis)</strong>, em conformidade com os Princípios Contábeis Geralmente Aceitos nos EUA (U.S. GAAP) aplicáveis a entidades de base de caixa, utilizando os registros contábeis fornecidos à GNO Tax &amp; Business Center durante o período indicado.',
    ctaIntro: 'Clique no botão abaixo para acessar seu relatório personalizado com a análise de resultados explicada por nossa equipe:',
    ctaBtn: 'Ver meu Relatório Financeiro',
    ctaSub: 'Acesso privado e seguro',
    discTitle: 'Escopo Profissional e Limitações — Aviso Importante',
    discText: (c) => `Este relatório foi preparado exclusivamente para fins informativos e de gestão interna para <strong>${c}</strong>. <strong>Não constitui assessoria tributária formal nem opinião fiscal sob o Internal Revenue Code (IRC)</strong> e não deve ser interpretado como tal conforme as regulamentações Circular 230 do IRS. Os resultados financeiros aqui apresentados refletem as transações registradas no período indicado sob o método de contabilidade de caixa e podem estar sujeitos a ajustes fiscais adicionais. Este documento não representa uma auditoria, revisão ou compilação sob os padrões SSARS. Para orientação específica sobre sua situação tributária, convidamos você a agendar uma consulta com nossa equipe profissional.<br><br><strong>Confidencialidade:</strong> As informações contidas nesta mensagem e seus anexos são confidenciais, de uso exclusivo do destinatário e protegidas pelas normas de confidencialidade cliente-contador aplicáveis no Estado de Louisiana. Se você não é o destinatário autorizado, por favor exclua esta mensagem e notifique o remetente imediatamente.`,
    consultBtn: 'Agendar Consulta com seu Contador',
    footerWeb: 'Site',
    footerCal: 'Agendar Consulta',
    footerContact: 'Contato',
    subject: 'Relatório Financeiro',
  },
};

type WelcomeStrings = {
  subject: string;
  salutation: string;
  intro: string;
  ctaBtn: string;
  ctaSub: string;
  closing: string;
};

const WELCOME_LANG: Record<string, WelcomeStrings> = {
  es: {
    subject: 'Bienvenido a tu Informe Financiero Mensual',
    salutation: 'Estimado/a',
    intro: 'En <strong>GNO Tax &amp; Business Center</strong> estamos emocionados de anunciarle un nuevo servicio exclusivo para nuestros clientes: a partir de este mes, recibirá cada mes un <strong>video personalizado</strong> con el resumen financiero de su empresa, directamente en su correo electrónico.',
    ctaBtn: 'Ver Video de Bienvenida',
    ctaSub: 'Conoce cómo funciona tu informe mensual',
    closing: 'El día 25 de cada mes recibirá su primer informe con el análisis de resultados de su empresa. ¡Estamos para servirle!',
  },
  en: {
    subject: 'Welcome to Your Monthly Financial Report',
    salutation: 'Dear',
    intro: 'At <strong>GNO Tax &amp; Business Center</strong>, we are excited to announce a new exclusive service for our clients: starting this month, you will receive a <strong>personalized video</strong> every month with your business financial summary, delivered directly to your email.',
    ctaBtn: 'Watch Welcome Video',
    ctaSub: 'Learn how your monthly report works',
    closing: 'On the 25th of each month, you will receive your report with your business results analysis. We are here to serve you!',
  },
  fr: {
    subject: 'Bienvenue à votre Rapport Financier Mensuel',
    salutation: 'Cher/Chère',
    intro: 'Chez <strong>GNO Tax &amp; Business Center</strong>, nous sommes ravis de vous annoncer un nouveau service exclusif pour nos clients : à partir de ce mois, vous recevrez chaque mois une <strong>vidéo personnalisée</strong> avec le résumé financier de votre entreprise, directement dans votre boîte e-mail.',
    ctaBtn: 'Voir la Vidéo de Bienvenue',
    ctaSub: 'Découvrez comment fonctionne votre rapport mensuel',
    closing: 'Le 25 de chaque mois, vous recevrez votre rapport avec l\'analyse des résultats de votre entreprise. Nous sommes à votre service !',
  },
  pt: {
    subject: 'Bem-vindo ao seu Relatório Financeiro Mensal',
    salutation: 'Prezado/a',
    intro: 'Na <strong>GNO Tax &amp; Business Center</strong>, estamos entusiasmados em anunciar um novo serviço exclusivo para nossos clientes: a partir deste mês, você receberá todo mês um <strong>vídeo personalizado</strong> com o resumo financeiro da sua empresa, diretamente no seu e-mail.',
    ctaBtn: 'Assistir Vídeo de Boas-vindas',
    ctaSub: 'Saiba como funciona seu relatório mensal',
    closing: 'No dia 25 de cada mês, você receberá seu relatório com a análise dos resultados da sua empresa. Estamos aqui para ajudar!',
  },
};

export function getWelcomeSubject(compania: string, idioma?: string | null): string {
  const t = WELCOME_LANG[normalizeLang(idioma)] || WELCOME_LANG.es;
  return `${t.subject} — ${compania}`;
}

export function buildWelcomeEmail(vars: { nombre: string; compania: string; videoUrl: string; magicToken: string; idioma?: string | null }): string {
  const t = WELCOME_LANG[normalizeLang(vars.idioma)] || WELCOME_LANG.es;
  const lang = normalizeLang(vars.idioma);
  const et = EMAIL_LANG[lang] || EMAIL_LANG.es;
  const appUrl = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://gno-informe-mensual.vercel.app'
  ).replace(/\/+$/, '');
  const calLink = process.env.GNO_CAL_LINK ?? 'https://cal.com/gno';
  const phone = process.env.GNO_PHONE ?? '504 896 0276';
  const website = process.env.GNO_WEBSITE ?? 'https://www.gnotaxservices.com';
  const reportUrl = `${appUrl}/r/${vars.magicToken}`;

  return /* html */`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject} — ${vars.compania}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500;600&display=swap">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#EEF2F7;font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.65;padding:40px 16px 60px}
    .card{max-width:600px;margin:0 auto;background:#fff;border:1px solid #D6DDE8;overflow:hidden}
    .header{background:#0B1F3A;padding:36px 40px 28px}
    .logo{height:48px;width:auto;display:block}
    .tagline{font-size:11px;font-weight:400;color:#7FA3C4;letter-spacing:.14em;text-transform:uppercase;margin-top:8px}
    .rule{height:2px;background:linear-gradient(90deg,#C49A2E 0%,#E8C96A 50%,transparent 100%);margin-top:24px}
    .badge{background:#2E7D32;padding:14px 40px;display:flex;align-items:center;justify-content:center}
    .badge-label{font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:#fff}
    .body{padding:40px 40px 32px}
    .salutation{font-family:'Playfair Display',Georgia,serif;font-size:20px;color:#1A2B3C;margin-bottom:20px}
    p{color:#3D4F63;font-size:14.5px;line-height:1.72;margin-bottom:18px}
    .cta{text-align:center;margin:32px 0}
    .btn{display:inline-block;background:#2E7D32;color:#fff;text-decoration:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:16px 40px}
    .cta-sub{display:block;font-size:11.5px;color:#6B7A8D;margin-top:10px}
    .sig{padding:28px 40px 32px;border-top:1px solid #D6DDE8}
    .sig-name{font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:600;color:#1A2B3C}
    .sig-cred{font-size:11.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#C49A2E;margin-top:2px}
    .sig-firm{font-size:13px;color:#3D4F63;margin-top:6px}
    .sig-contact{margin-top:14px;display:flex;flex-direction:column;gap:4px}
    .sig-contact span{font-size:12.5px;color:#6B7A8D}
    .sig-contact a{color:#1D4E8F;text-decoration:none}
    .consult{padding:0 40px 36px;text-align:center}
    .consult-btn{display:inline-block;border:1.5px solid #1D4E8F;color:#1D4E8F;text-decoration:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:12px 32px}
    .footer{background:#0B1F3A;padding:20px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .footer-firm{font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#A8BBCC}
    .footer-links{display:flex;gap:16px}
    .footer-links a{font-size:11px;color:#A8BBCC;text-decoration:none;opacity:.7}
    @media(max-width:640px){
      .header,.body,.sig,.consult{padding-left:24px;padding-right:24px}
      .badge{padding:12px 24px}
      .footer{padding:18px 24px;flex-direction:column}
    }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <img src="https://gnotaxservices.com/wp-content/uploads/2024/07/cropped-gno_tax_business_center_logo-removebg-preview.png"
         alt="GNO Tax & Business Center" class="logo"
         onerror="this.outerHTML='<div style=\\'font-family:Playfair Display,Georgia,serif;font-size:22px;font-weight:600;color:#fff\\'>GNO Tax &amp; Business Center</div>'">
    <div class="tagline">Accountants MBA / CAA &nbsp;·&nbsp; New Orleans, Louisiana</div>
    <div class="rule"></div>
  </div>

  <div class="badge">
    <span class="badge-label">${t.subject}</span>
  </div>

  <div class="body">
    <p class="salutation">${t.salutation} ${vars.nombre},</p>
    <p>${t.intro}</p>
    <p>${t.closing}</p>
    <div class="cta">
      <a href="${reportUrl}" class="btn">${t.ctaBtn}</a>
      <span class="cta-sub">${t.ctaSub}</span>
    </div>
  </div>

  <div class="sig">
    <div class="sig-name">Jeiver González</div>
    <div class="sig-cred">Accountant MBA / CAA &nbsp;·&nbsp; Licensed Public Accountant — Louisiana</div>
    <div class="sig-firm">GNO Tax &amp; Business Center LLC</div>
    <div class="sig-contact">
      <span>📞 <a href="tel:${phone.replace(/\s/g, '')}">( ${phone})</a></span>
      <span>🌐 <a href="${website}">${website.replace('https://', '')}</a></span>
      <span>✉️ <a href="mailto:${process.env.GNO_REPLY_TO}">${process.env.GNO_REPLY_TO}</a></span>
    </div>
  </div>

  <div class="consult">
    <a href="${calLink}" class="consult-btn">${et.consultBtn}</a>
  </div>

  <div class="footer">
    <span class="footer-firm">GNO Tax &amp; Business Center LLC &nbsp;·&nbsp; New Orleans, LA</span>
    <div class="footer-links">
      <a href="${website}">${et.footerWeb}</a>
      <a href="${calLink}">${et.footerCal}</a>
      <a href="mailto:${process.env.GNO_REPLY_TO}">${et.footerContact}</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

export function getEmailSubject(compania: string, periodo: string, idioma?: string | null): string {
  const t = EMAIL_LANG[normalizeLang(idioma)] || EMAIL_LANG.es;
  return `${t.subject} - ${compania} - ${periodo}`;
}

export function buildReportEmail(vars: ReportEmailVars): string {
  const t = EMAIL_LANG[normalizeLang(vars.idioma)] || EMAIL_LANG.es;
  // `||` (no `??`) para atrapar también string vacío; fallback = dominio real.
  const appUrl = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://gno-informe-mensual.vercel.app'
  ).replace(/\/+$/, '');
  const calLink = process.env.GNO_CAL_LINK ?? 'https://cal.com/gno';
  const phone = process.env.GNO_PHONE ?? '504 896 0276';
  const website = process.env.GNO_WEBSITE ?? 'https://www.gnotaxservices.com';
  const reportUrl = `${appUrl}/r/${vars.magicToken}`;

  return /* html */`<!DOCTYPE html>
<html lang="${t.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title} — ${vars.compania}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500;600&display=swap">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#EEF2F7;font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.65;padding:40px 16px 60px}
    .card{max-width:600px;margin:0 auto;background:#fff;border:1px solid #D6DDE8;overflow:hidden}
    .header{background:#0B1F3A;padding:36px 40px 28px}
    .logo{height:48px;width:auto;display:block}
    .tagline{font-size:11px;font-weight:400;color:#7FA3C4;letter-spacing:.14em;text-transform:uppercase;margin-top:8px}
    .rule{height:2px;background:linear-gradient(90deg,#C49A2E 0%,#E8C96A 50%,transparent 100%);margin-top:24px}
    .badge{background:#1D4E8F;padding:14px 40px;display:flex;align-items:center;justify-content:space-between}
    .badge-label{font-size:10.5px;font-weight:500;letter-spacing:.13em;text-transform:uppercase;color:#7FA3C4}
    .badge-value{font-size:12px;font-weight:500;color:#fff}
    .body{padding:40px 40px 32px}
    .salutation{font-family:'Playfair Display',Georgia,serif;font-size:20px;color:#1A2B3C;margin-bottom:20px}
    p{color:#3D4F63;font-size:14.5px;line-height:1.72;margin-bottom:18px}
    .basis{font-size:12.5px;color:#6B7A8D;font-style:italic;border-left:2px solid #C49A2E;padding-left:14px;margin:24px 0;line-height:1.6}
    .cta{text-align:center;margin:32px 0}
    .btn{display:inline-block;background:#1D4E8F;color:#fff;text-decoration:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:16px 40px}
    .cta-sub{display:block;font-size:11.5px;color:#6B7A8D;margin-top:10px}
    hr{border:none;border-top:1px solid #D6DDE8;margin:28px 0}
    .disclaimer{background:#F2F5FA;border:1px solid #D6DDE8;padding:22px 24px;margin-top:8px}
    .disc-title{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6B7A8D;margin-bottom:10px}
    .disc-text{font-size:11.5px;color:#6B7A8D;line-height:1.7}
    .sig{padding:28px 40px 32px;border-top:1px solid #D6DDE8}
    .sig-name{font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:600;color:#1A2B3C}
    .sig-cred{font-size:11.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#C49A2E;margin-top:2px}
    .sig-firm{font-size:13px;color:#3D4F63;margin-top:6px}
    .sig-contact{margin-top:14px;display:flex;flex-direction:column;gap:4px}
    .sig-contact span{font-size:12.5px;color:#6B7A8D}
    .sig-contact a{color:#1D4E8F;text-decoration:none}
    .consult{padding:0 40px 36px;text-align:center}
    .consult-btn{display:inline-block;border:1.5px solid #1D4E8F;color:#1D4E8F;text-decoration:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:12px 32px}
    .footer{background:#0B1F3A;padding:20px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .footer-firm{font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#A8BBCC}
    .footer-links{display:flex;gap:16px}
    .footer-links a{font-size:11px;color:#A8BBCC;text-decoration:none;opacity:.7}
    @media(max-width:640px){
      .header,.body,.sig,.consult{padding-left:24px;padding-right:24px}
      .badge{padding:12px 24px;flex-direction:column;gap:4px}
      .footer{padding:18px 24px;flex-direction:column}
    }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <img src="https://gnotaxservices.com/wp-content/uploads/2024/07/cropped-gno_tax_business_center_logo-removebg-preview.png"
         alt="GNO Tax & Business Center" class="logo"
         onerror="this.outerHTML='<div style=\\'font-family:Playfair Display,Georgia,serif;font-size:22px;font-weight:600;color:#fff\\'>GNO Tax &amp; Business Center</div>'">
    <div class="tagline">Accountants MBA / CAA &nbsp;·&nbsp; New Orleans, Louisiana</div>
    <div class="rule"></div>
  </div>

  <div class="badge">
    <span class="badge-label">${t.badge}</span>
    <span class="badge-value">${vars.compania} &nbsp;·&nbsp; ${vars.periodo}</span>
  </div>

  <div class="body">
    <p class="salutation">${t.salutation} ${vars.nombre},</p>
    <p>${t.intro} <strong>${vars.periodo}</strong> para <strong>${vars.compania}</strong>.</p>
    <div class="basis">${t.basis}</div>
    <p>${t.ctaIntro}</p>
    <div class="cta">
      <a href="${reportUrl}" class="btn">${t.ctaBtn}</a>
      <span class="cta-sub">${t.ctaSub} · ${vars.nombre}</span>
    </div>
    <hr>
    <div class="disclaimer">
      <div class="disc-title">${t.discTitle}</div>
      <p class="disc-text">${t.discText(vars.compania)}</p>
    </div>
  </div>

  <div class="sig">
    <div class="sig-name">Jeiver González</div>
    <div class="sig-cred">Accountant MBA / CAA &nbsp;·&nbsp; Licensed Public Accountant — Louisiana</div>
    <div class="sig-firm">GNO Tax &amp; Business Center LLC</div>
    <div class="sig-contact">
      <span>📞 <a href="tel:${phone.replace(/\s/g,'')}">( ${phone})</a></span>
      <span>🌐 <a href="${website}">${website.replace('https://','')}</a></span>
      <span>✉️ <a href="mailto:${process.env.GNO_REPLY_TO}">${process.env.GNO_REPLY_TO}</a></span>
    </div>
  </div>

  <div class="consult">
    <a href="${calLink}" class="consult-btn">${t.consultBtn}</a>
  </div>

  <div class="footer">
    <span class="footer-firm">GNO Tax &amp; Business Center LLC &nbsp;·&nbsp; New Orleans, LA</span>
    <div class="footer-links">
      <a href="${website}">${t.footerWeb}</a>
      <a href="${calLink}">${t.footerCal}</a>
      <a href="mailto:${process.env.GNO_REPLY_TO}">${t.footerContact}</a>
    </div>
  </div>
</div>
</body>
</html>`;
}
