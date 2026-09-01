interface ReportEmailVars {
  nombre: string;
  compania: string;
  periodo: string;
  videoUrl: string;
  magicToken: string;
}

export function buildReportEmail(vars: ReportEmailVars): string {
  const appUrl = process.env.NEXTAUTH_URL ?? 'https://app.gnotaxservices.com';
  const calLink = process.env.GNO_CAL_LINK ?? 'https://cal.com/gno';
  const phone = process.env.GNO_PHONE ?? '504 896 0276';
  const website = process.env.GNO_WEBSITE ?? 'https://www.gnotaxservices.com';
  const reportUrl = `${appUrl}/r/${vars.magicToken}`;

  return /* html */`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe Financiero Mensual — ${vars.compania}</title>
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
    <span class="badge-label">Informe Financiero Mensual</span>
    <span class="badge-value">${vars.compania} &nbsp;·&nbsp; ${vars.periodo}</span>
  </div>

  <div class="body">
    <p class="salutation">Estimado/a ${vars.nombre},</p>
    <p>En GNO Tax &amp; Business Center nos comprometemos a mantenerle informado sobre la salud financiera de su empresa de manera clara, oportuna y profesional. Nos complace presentarle el informe financiero correspondiente al periodo de <strong>${vars.periodo}</strong> para <strong>${vars.compania}</strong>.</p>
    <div class="basis">Los estados financieros han sido preparados bajo el método de <strong>contabilidad de caja (Cash Basis)</strong>, conforme a los Principios de Contabilidad Generalmente Aceptados (U.S. GAAP) aplicables a entidades de base efectivo, utilizando los registros contables suministrados a GNO Tax &amp; Business Center durante el periodo indicado.</div>
    <p>Haga clic en el botón a continuación para acceder a su informe personalizado con el análisis de resultados explicado por nuestro equipo:</p>
    <div class="cta">
      <a href="${reportUrl}" class="btn">Ver mi Informe Financiero</a>
      <span class="cta-sub">Acceso privado y seguro · Solo para ${vars.nombre}</span>
    </div>
    <hr>
    <div class="disclaimer">
      <div class="disc-title">Alcance Profesional y Limitaciones — Aviso Importante</div>
      <p class="disc-text">Este informe ha sido preparado exclusivamente con fines informativos y de gestión interna para <strong>${vars.compania}</strong>. <strong>No constituye asesoría tributaria formal ni una opinión fiscal bajo el Internal Revenue Code (IRC)</strong> y no debe interpretarse como tal conforme a las Circular 230 Regulations del IRS. Los resultados financieros aquí presentados reflejan las transacciones registradas en el periodo indicado bajo el método de contabilidad de caja y pueden estar sujetos a ajustes fiscales adicionales requeridos por el IRC, incluyendo entre otros: ajustes por diferencias temporales, deducciones sujetas a limitación (§179, §163(j), §461(l)) y créditos tributarios aplicables. Este documento no representa una auditoría, revisión ni compilación bajo los estándares de SSARS. Para orientación específica sobre su situación tributaria, le invitamos a programar una consulta con nuestro equipo profesional.<br><br><strong>Confidencialidad:</strong> La información contenida en este mensaje y sus adjuntos es confidencial, de uso exclusivo del destinatario y está protegida bajo las normas de confidencialidad de cliente-contador aplicables en el Estado de Louisiana. Si usted no es el destinatario autorizado, por favor elimine este mensaje y notifique al remitente de inmediato.</p>
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
    <a href="${calLink}" class="consult-btn">Agendar Consulta con su Contador</a>
  </div>

  <div class="footer">
    <span class="footer-firm">GNO Tax &amp; Business Center LLC &nbsp;·&nbsp; New Orleans, LA</span>
    <div class="footer-links">
      <a href="${website}">Sitio Web</a>
      <a href="${calLink}">Agendar Cita</a>
      <a href="mailto:${process.env.GNO_REPLY_TO}">Contacto</a>
    </div>
  </div>
</div>
</body>
</html>`;
}
