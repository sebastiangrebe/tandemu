import { emailLayout } from './layout.js';

export function renderMemberAddedTeam(data: {
  memberName: string;
  teamName: string;
  organizationName: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Added to a team</h2>
    <p style="margin:0; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Hi <strong>${data.memberName}</strong>, you've been added to the
      <strong>${data.teamName}</strong> team in <strong>${data.organizationName}</strong>.
    </p>
  `);
}
