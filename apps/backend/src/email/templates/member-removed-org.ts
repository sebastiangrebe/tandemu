import { emailLayout } from './layout.js';

export function renderMemberRemovedOrg(data: {
  memberName: string;
  organizationName: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Organization Access Removed</h2>
    <p style="margin:0; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Hi <strong>${data.memberName}</strong>, your access to
      <strong>${data.organizationName}</strong> has been removed.
    </p>
    <p style="margin:16px 0 0; font-size:13px; color:#a1a1aa;">
      If you believe this was a mistake, please contact your organization's administrator.
    </p>
  `);
}
