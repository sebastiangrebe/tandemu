import { emailLayout } from './layout.js';

export function renderInviteCreated(data: {
  inviterName: string;
  organizationName: string;
  role: string;
  frontendUrl: string;
  inviteId: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">You've been invited!</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#d4d4d8; line-height:1.6;">
      <strong>${data.inviterName}</strong> invited you to join
      <strong>${data.organizationName}</strong> as <strong>${data.role}</strong>.
    </p>
    <p style="margin:24px 0;">
      <a href="${data.frontendUrl}/invites/${data.inviteId}"
         style="display:inline-block; padding:12px 28px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
        Accept Invite
      </a>
    </p>
    <p style="margin:0; font-size:13px; color:#a1a1aa;">
      If you don't have a Tandemu account, you'll be asked to create one first.
    </p>
  `);
}
