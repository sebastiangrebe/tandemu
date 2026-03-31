import { emailLayout } from './layout.js';

export function renderInviteAccepted(data: {
  acceptedByName: string;
  organizationName: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Invite Accepted</h2>
    <p style="margin:0; font-size:15px; color:#374151; line-height:1.6;">
      <strong>${data.acceptedByName}</strong> accepted your invite and joined
      <strong>${data.organizationName}</strong>.
    </p>
  `);
}
