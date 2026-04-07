import { emailLayout } from './layout.js';

export function renderMemberAddedOrg(data: {
  memberName: string;
  organizationName: string;
  role: string;
  frontendUrl: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">You've been added to an organization</h2>
    <p style="margin:0; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Hi <strong>${data.memberName}</strong>, you've been added to
      <strong>${data.organizationName}</strong> as <strong>${data.role}</strong>.
    </p>
    <p style="margin:24px 0;">
      <a href="${data.frontendUrl}"
         style="display:inline-block; padding:12px 28px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
        Open Dashboard
      </a>
    </p>
  `);
}
