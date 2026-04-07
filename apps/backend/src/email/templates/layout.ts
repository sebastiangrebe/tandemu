const BRAND_COLOR = '#6366f1';

const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(16 16) rotate(45)"><rect x="-11.314" y="-11.314" width="22.627" height="22.627" rx="4" fill="white"/><rect x="-8.314" y="-8.314" width="16.627" height="16.627" rx="3" fill="#09090b"/><rect x="-5.314" y="-5.314" width="10.627" height="10.627" rx="2" fill="white"/></g></svg>`;

export function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#09090b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b; padding:40px 16px;">
    <tr><td align="center">
      <!-- Logo above card -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
        <td style="vertical-align:middle; padding-right:10px;">${LOGO_SVG}</td>
        <td style="vertical-align:middle;"><span style="font-size:20px; font-weight:700; color:#fafafa; letter-spacing:-0.5px;">Tandemu</span></td>
      </tr></table>
      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" style="background:#18181b; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
        <!-- Accent bar -->
        <tr><td style="padding:0 32px;"><div style="height:2px; background:linear-gradient(90deg, ${BRAND_COLOR}, #818cf8); border-radius:1px;"></div></td></tr>
        <tr>
          <td style="padding:32px 32px 40px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px; border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0; font-size:12px; color:#71717a;">
              This is a transactional email from Tandemu. You received it because of an action in your organization.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
