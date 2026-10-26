import { AppNotification, DispatchedEmail, StaffUser } from '../types';

/**
 * Service to automatically generate and trigger email notifications
 * for every system and user action notification in the WIPAHS portal.
 */

export function generateNotificationEmail({
  notification,
  recipient,
}: {
  notification: AppNotification;
  recipient: StaffUser;
}): DispatchedEmail {
  const isUrgent = notification.priority === 'Urgent';
  const subject = `[WIPAHS Portal${isUrgent ? ' - URGENT' : ''}] ${notification.title}`;
  const now = new Date();
  const timeFormatted = now.toLocaleString('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' EAT';

  const bodyText = `Dear ${recipient.name},

You have received an official operational notification from the WIPAHS Portal:

"${notification.message}"

Notification Details:
• Title: ${notification.title}
• Priority: ${notification.priority || 'Normal'}
• Category: ${notification.type.toUpperCase()}
• Triggered By: ${notification.actorName || 'System'}
• Time: ${timeFormatted}
• Recipient: ${recipient.name} (${recipient.email})

This is an automated operational broadcast to ensure no updates are missed. Please sign in to the WIPAHS Operations & Management Portal to review or take action.

Kind regards,
WIPAHS Operations & Communications
Dar es Salaam, Tanzania`;

  const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: #008f18; padding: 20px 24px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 6px; }
    .badge-urgent { background: #ffe4e6; color: #9f1239; }
    .badge-normal { background: #dcfce7; color: #166534; }
    .content { padding: 24px; }
    .greeting { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .message-box { background: #f1f5f9; border-left: 4px solid #00ad1d; padding: 14px 16px; border-radius: 0 6px 6px 0; font-size: 14px; line-height: 1.6; margin: 16px 0; color: #0f172a; }
    .details { margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-size: 13px; background: #fafafa; }
    .details-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
    .details-row:last-child { border-bottom: none; }
    .details-label { color: #64748b; font-weight: 500; }
    .details-value { color: #1e293b; font-weight: 600; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>WIPAHS Portal Alert</h1>
      <span class="badge ${isUrgent ? 'badge-urgent' : 'badge-normal'}">${notification.priority || 'Normal'} Priority</span>
    </div>
    <div class="content">
      <div class="greeting">Dear ${recipient.name},</div>
      <p style="font-size: 14px; color: #334155; margin: 0 0 12px 0;">An official update has been broadcast on your portal account:</p>
      <div class="message-box">
        <strong>${notification.title}</strong><br/>
        ${notification.message}
      </div>
      <div class="details">
        <div class="details-row"><span class="details-label">Triggered by:</span><span class="details-value">${notification.actorName || 'System'}</span></div>
        <div class="details-row"><span class="details-label">Category:</span><span class="details-value">${notification.type}</span></div>
        <div class="details-row"><span class="details-label">Timestamp:</span><span class="details-value">${timeFormatted}</span></div>
        <div class="details-row"><span class="details-label">Delivered to:</span><span class="details-value">${recipient.email}</span></div>
      </div>
    </div>
    <div class="footer">
      World Islamic People's Aid & Help Society (WIPAHS) • Operations Portal<br/>
      Dar es Salaam, Tanzania • Automatic email dispatch triggered for all portal updates
    </div>
  </div>
</body>
</html>
  `.trim();

  return {
    id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    notificationId: notification.id,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    senderName: notification.actorName || 'WIPAHS Operations Portal',
    senderEmail: 'notifications@wipahs.org',
    subject,
    bodyText,
    bodyHtml,
    timestamp: now.toISOString(),
    priority: (notification.priority as 'Urgent' | 'Normal') || 'Normal',
    category: notification.type || 'general',
    status: 'Delivered',
  };
}
