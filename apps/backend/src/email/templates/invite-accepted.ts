import { emailLayout } from './layout.js';

export function renderInviteAccepted(data: {
  acceptedByName: string;
  organizationName: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Invite Accepted</h2>
    <p style="margin:0; font-size:15px; color:#d4d4d8; line-height:1.6;">
      <strong>${data.acceptedByName}</strong> accepted your invite and joined
      <strong>${data.organizationName}</strong>.
    </p>
  `);
}
