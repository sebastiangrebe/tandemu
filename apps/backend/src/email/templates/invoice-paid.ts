import { emailLayout } from './layout.js';

export function renderInvoicePaid(data: {
  organizationName: string;
  amountFormatted: string;
  periodLabel: string;
  invoiceUrl: string;
  frontendUrl: string;
}): string {
  return emailLayout(`
    <h2 style="margin:0 0 16px; font-size:22px; color:#fafafa;">Invoice Paid</h2>
    <p style="margin:0 0 12px; font-size:15px; color:#d4d4d8; line-height:1.6;">
      Your subscription invoice for <strong>${data.organizationName}</strong> has been paid.
    </p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr>
        <td style="padding:8px 0; font-size:14px; color:#a1a1aa;">Amount</td>
        <td style="padding:8px 0; font-size:14px; color:#fafafa; text-align:right; font-weight:600;">${data.amountFormatted}</td>
      </tr>
      <tr>
        <td style="padding:8px 0; font-size:14px; color:#a1a1aa; border-top:1px solid #27272a;">Period</td>
        <td style="padding:8px 0; font-size:14px; color:#fafafa; text-align:right; border-top:1px solid #27272a;">${data.periodLabel}</td>
      </tr>
    </table>
    <p style="margin:24px 0;">
      <a href="${data.invoiceUrl}"
         style="display:inline-block; padding:12px 28px; background:#6366f1; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
        View Invoice
      </a>
    </p>
    <p style="margin:0; font-size:13px; color:#a1a1aa;">
      You can also manage your subscription from the
      <a href="${data.frontendUrl}/settings" style="color:#818cf8; text-decoration:none;">Settings</a> page.
    </p>
  `);
}
