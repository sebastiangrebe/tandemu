import { emailLayout } from './layout.js';

export function renderIntegrationConnected(data: {
  provider: string;
  organizationName: string;
  connectedByName: string;
  frontendUrl: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Integration Connected</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#374151; line-height:1.6;">
      <strong>${data.connectedByName}</strong> connected <strong>${data.provider}</strong>
      to <strong>${data.organizationName}</strong>.
    </p>
    <p style="margin:24px 0;">
      <a href="${data.frontendUrl}/settings/integrations"
         style="display:inline-block; padding:12px 24px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">
        View Integrations
      </a>
    </p>
  `);
}
