import { emailLayout } from './layout.js';

export function renderWelcome(data: {
  userName: string;
  autoAcceptedOrgs: Array<{ name: string; role: string }>;
  frontendUrl: string;
}): string {
  const orgList = data.autoAcceptedOrgs.length > 0
    ? `
      <p style="margin:16px 0 8px; font-size:15px; color:#d4d4d8;">
        You've automatically joined:
      </p>
      <ul style="margin:0 0 16px; padding-left:20px; color:#d4d4d8; font-size:14px; line-height:1.8;">
        ${data.autoAcceptedOrgs.map((o) => `<li><strong>${o.name}</strong> as ${o.role}</li>`).join('')}
      </ul>`
    : '';

  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Welcome to Tandemu!</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Hi <strong>${data.userName}</strong>, your account is ready.
    </p>
    ${orgList}
    <p style="margin:24px 0;">
      <a href="${data.frontendUrl}"
         style="display:inline-block; padding:12px 28px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
        Open Dashboard
      </a>
    </p>
  `);
}
