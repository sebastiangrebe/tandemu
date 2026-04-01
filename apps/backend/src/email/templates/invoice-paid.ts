import { emailLayout } from './layout.js';

export function renderInvoicePaid(data: {
  organizationName: string;
  amountFormatted: string;
  periodLabel: string;
  invoiceUrl: string;
  frontendUrl: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Invoice Paid</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#374151; line-height:1.6;">
      Your subscription invoice for <strong>${data.organizationName}</strong> has been paid.
    </p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr>
        <td style="padding:8px 0; font-size:14px; color:#6b7280;">Amount</td>
        <td style="padding:8px 0; font-size:14px; color:#111827; text-align:right; font-weight:600;">${data.amountFormatted}</td>
      </tr>
      <tr>
        <td style="padding:8px 0; font-size:14px; color:#6b7280; border-top:1px solid #e5e7eb;">Period</td>
        <td style="padding:8px 0; font-size:14px; color:#111827; text-align:right; border-top:1px solid #e5e7eb;">${data.periodLabel}</td>
      </tr>
    </table>
    <p style="margin:24px 0;">
      <a href="${data.invoiceUrl}"
         style="display:inline-block; padding:12px 24px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">
        View Invoice
      </a>
    </p>
    <p style="margin:0; font-size:13px; color:#6b7280;">
      You can also manage your subscription from the
      <a href="${data.frontendUrl}/settings" style="color:#6366f1; text-decoration:none;">Settings</a> page.
    </p>
  `);
}
