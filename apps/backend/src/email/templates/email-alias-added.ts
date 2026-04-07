import { emailLayout } from './layout.js';

export function renderEmailAliasAdded(data: {
  userName: string;
  aliasEmail: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Email Alias Added</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Hi <strong>${data.userName}</strong>, the email address
      <strong>${data.aliasEmail}</strong> has been added to your Tandemu account.
    </p>
    <p style="margin:0; font-size:13px; color:#a1a1aa;">
      Tasks and commits linked to this email will now be attributed to you.
    </p>
  `);
}
