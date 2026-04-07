const LOGO_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNiAxNikgcm90YXRlKDQ1KSI+PHJlY3QgeD0iLTExLjMxNCIgeT0iLTExLjMxNCIgd2lkdGg9IjIyLjYyNyIgaGVpZ2h0PSIyMi42MjciIHJ4PSI0IiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9Ii04LjMxNCIgeT0iLTguMzE0IiB3aWR0aD0iMTYuNjI3IiBoZWlnaHQ9IjE2LjYyNyIgcng9IjMiIGZpbGw9IiMwOTA5MGIiLz48cmVjdCB4PSItNS4zMTQiIHk9Ii01LjMxNCIgd2lkdGg9IjEwLjYyNyIgaGVpZ2h0PSIxMC42MjciIHJ4PSIyIiBmaWxsPSJ3aGl0ZSIvPjwvZz48L3N2Zz4=';

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
        <td style="vertical-align:middle; padding-right:10px;"><img src="${LOGO_DATA_URI}" width="28" height="28" alt="Tandemu" style="display:block;" /></td>
        <td style="vertical-align:middle;"><span style="font-size:20px; font-weight:700; color:#fafafa; letter-spacing:-0.5px;">Tandemu</span></td>
      </tr></table>
      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" style="background:#18181b; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
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
