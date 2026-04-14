'use strict';

const { SendEmailCommand } = require('@aws-sdk/client-ses');
const { sesClient } = require('../config/aws');

const FROM_ADDRESS = () =>
  `${process.env.SES_FROM_NAME || 'ClearPath EDI Portal'} <${process.env.SES_FROM_ADDRESS || 'noreply@clearpath-edi.com'}>`;

// ─── Base HTML Template ───────────────────────────────────────────────────────

/**
 * Wraps arbitrary HTML content in a branded email shell.
 */
function buildHtmlWrapper(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f9; font-family: Arial, Helvetica, sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a56db; padding: 24px 32px; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0; color: #bfdbfe; font-size: 13px; }
    .body { padding: 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h2 { color: #1a56db; margin-top: 0; }
    .detail-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .detail-box table { width: 100%; border-collapse: collapse; }
    .detail-box td { padding: 6px 0; font-size: 14px; }
    .detail-box td:first-child { color: #6b7280; width: 45%; }
    .detail-box td:last-child { font-weight: 600; color: #111827; }
    .btn { display: inline-block; margin: 24px 0 8px; padding: 12px 28px; background: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 32px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>ClearPath EDI Portal</h1>
      <p>Healthcare Electronic Data Interchange</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ClearPath EDI Portal. All rights reserved.<br />
      This is an automated message &mdash; please do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

// ─── Core Send Function ───────────────────────────────────────────────────────

/**
 * Send a transactional email via AWS SES.
 *
 * @param {object} params
 * @param {string|string[]} params.to       Recipient address(es).
 * @param {string}          params.subject
 * @param {string}          params.htmlBody  Full HTML string.
 * @param {string}          [params.textBody]  Plain-text fallback.
 * @returns {Promise<void>}
 */
async function sendEmail({ to, subject, htmlBody, textBody }) {
  const recipients = Array.isArray(to) ? to : [to];

  await sesClient.send(
    new SendEmailCommand({
      Source: FROM_ADDRESS(),
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          ...(textBody && { Text: { Data: textBody, Charset: 'UTF-8' } }),
        },
      },
    }),
  );
}

// ─── Pre-built Templates ──────────────────────────────────────────────────────

/**
 * Confirmation email sent after an EDI 270 transaction is submitted.
 */
async function sendEdi270Confirmation({ to, refId, orgName }) {
  const subject = `EDI 270 Submitted – Reference ${refId}`;
  const bodyHtml = buildHtmlWrapper(subject, `
    <h2>Eligibility Inquiry Submitted</h2>
    <p>Hello${orgName ? ` ${orgName}` : ''},</p>
    <p>Your EDI 270 Eligibility Inquiry has been received and queued for processing.</p>
    <div class="detail-box">
      <table>
        <tr><td>Reference ID</td><td>${refId}</td></tr>
        <tr><td>Transaction Type</td><td>270 – Eligibility Inquiry</td></tr>
        <tr><td>Submitted At</td><td>${new Date().toUTCString()}</td></tr>
        <tr><td>Status</td><td>Pending Processing</td></tr>
      </table>
    </div>
    <p>You will receive a follow-up notification once the response (271) is received from the payer.</p>
    <p>You can also check transaction status at any time in the ClearPath portal.</p>
  `);

  const textBody = `EDI 270 Submitted\n\nReference ID: ${refId}\nOrganization: ${orgName || 'N/A'}\nStatus: Pending Processing\nSubmitted At: ${new Date().toUTCString()}`;

  await sendEmail({ to, subject, htmlBody: bodyHtml, textBody });
}

/**
 * Payment confirmation email.
 */
async function sendPaymentConfirmation({ to, amount, refId }) {
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  const subject = `Payment Confirmed – ${formattedAmount} (${refId})`;

  const bodyHtml = buildHtmlWrapper(subject, `
    <h2>Payment Confirmation</h2>
    <p>Your payment has been successfully processed.</p>
    <div class="detail-box">
      <table>
        <tr><td>Reference ID</td><td>${refId}</td></tr>
        <tr><td>Amount</td><td>${formattedAmount}</td></tr>
        <tr><td>Date</td><td>${new Date().toUTCString()}</td></tr>
        <tr><td>Status</td><td>Completed</td></tr>
      </table>
    </div>
    <p>Please retain this reference ID for your records. Contact support if you have any questions.</p>
  `);

  const textBody = `Payment Confirmed\n\nReference ID: ${refId}\nAmount: ${formattedAmount}\nDate: ${new Date().toUTCString()}`;

  await sendEmail({ to, subject, htmlBody: bodyHtml, textBody });
}

/**
 * Notification that a generated report is ready for download.
 */
async function sendReportReady({ to, reportName, downloadUrl }) {
  const subject = `Your Report is Ready – ${reportName}`;

  const bodyHtml = buildHtmlWrapper(subject, `
    <h2>Report Ready for Download</h2>
    <p>Your requested report <strong>${reportName}</strong> has been generated and is ready for download.</p>
    <div class="detail-box">
      <table>
        <tr><td>Report Name</td><td>${reportName}</td></tr>
        <tr><td>Generated At</td><td>${new Date().toUTCString()}</td></tr>
        <tr><td>Link Expires</td><td>1 hour from generation</td></tr>
      </table>
    </div>
    <p>Click the button below to download your report. The link is valid for 1 hour.</p>
    <a href="${downloadUrl}" class="btn">Download Report</a>
    <p style="font-size:13px;color:#6b7280;">If the button does not work, copy and paste this URL into your browser:<br />${downloadUrl}</p>
  `);

  const textBody = `Your Report is Ready\n\nReport: ${reportName}\nDownload URL (valid 1 hour): ${downloadUrl}`;

  await sendEmail({ to, subject, htmlBody: bodyHtml, textBody });
}

/**
 * Password reset code email.
 */
async function sendPasswordReset({ to, resetCode }) {
  const subject = 'Your ClearPath Password Reset Code';

  const bodyHtml = buildHtmlWrapper(subject, `
    <h2>Password Reset Request</h2>
    <p>We received a request to reset the password for your ClearPath EDI Portal account.</p>
    <p>Use the verification code below to complete the password reset. This code expires in <strong>15 minutes</strong>.</p>
    <div class="detail-box" style="text-align:center;">
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1a56db;margin:8px 0;">${resetCode}</p>
      <p style="margin:4px 0;color:#6b7280;font-size:13px;">Verification Code (expires in 15 minutes)</p>
    </div>
    <p>If you did not request a password reset, please ignore this email or contact support if you believe your account has been compromised.</p>
  `);

  const textBody = `Password Reset\n\nYour verification code: ${resetCode}\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`;

  await sendEmail({ to, subject, htmlBody: bodyHtml, textBody });
}

/**
 * Welcome email sent after successful registration.
 */
async function sendWelcomeEmail({ to, givenName, orgName }) {
  const subject = 'Welcome to ClearPath EDI Portal';

  const bodyHtml = buildHtmlWrapper(subject, `
    <h2>Welcome, ${givenName || 'New User'}!</h2>
    <p>Thank you for registering with the ClearPath EDI Portal${orgName ? ` on behalf of <strong>${orgName}</strong>` : ''}.</p>
    <p>Your account is now active. Here's what you can do:</p>
    <ul>
      <li>Submit EDI 270 Eligibility Inquiries</li>
      <li>Track transaction status and receive 271 responses</li>
      <li>Manage payments and bank accounts</li>
      <li>Generate and download detailed reports</li>
    </ul>
    <p>Get started by logging into the portal.</p>
  `);

  const textBody = `Welcome to ClearPath EDI Portal!\n\nYour account is now active. Log in to get started.`;

  await sendEmail({ to, subject, htmlBody: bodyHtml, textBody });
}

module.exports = {
  sendEmail,
  sendEdi270Confirmation,
  sendPaymentConfirmation,
  sendReportReady,
  sendPasswordReset,
  sendWelcomeEmail,
};
