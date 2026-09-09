function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface ReminderParticipant {
  name: string
  email: string
  amount_owed: number
  is_paid: boolean
}

export interface ReminderSplit {
  title: string
  total_amount: number
  category: string
  date: string
  description: string | null
}

export function buildSplitReminderEmail(opts: {
  recipientName: string
  creatorName: string
  split: ReminderSplit
  amountOwed: number
  allParticipants: ReminderParticipant[]
  appUrl: string
}): { subject: string; html: string } {
  const { recipientName, creatorName, split, amountOwed, allParticipants, appUrl } = opts

  const displayCreator = capitalize(creatorName)
  const displayRecipient = capitalize(recipientName.split(' ')[0])

  const subject = `Payment Reminder: ${split.title} — ${fmt(amountOwed)} due`

  const dateStr = new Date(split.date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const participantRows = allParticipants.map(p => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="display:inline-block;width:30px;height:30px;border-radius:50%;background:#334155;text-align:center;line-height:30px;font-size:12px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;">
          <div style="font-size:13px;font-weight:500;color:#1e293b;">${p.name}</div>
          ${p.email ? `<div style="font-size:11px;color:#94a3b8;">${p.email}</div>` : ''}
        </span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;white-space:nowrap;">
        <div style="font-size:13px;font-weight:600;color:${p.is_paid ? '#16a34a' : '#1e293b'};">${fmt(p.amount_owed)}</div>
        <div style="margin-top:3px;">
          ${p.is_paid
            ? `<span style="font-size:10px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;">Paid</span>`
            : `<span style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Pending</span>`
          }
        </div>
      </td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Payment Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f8fb;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

        <!-- BRAND ROW -->
        <tr>
          <td style="padding:0 0 20px;">
            <span style="font-size:13px;font-weight:700;color:#475569;letter-spacing:0.04em;text-transform:uppercase;">Finance Tracker</span>
          </td>
        </tr>

        <!-- MAIN CARD -->
        <tr>
          <td style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">

            <!-- Card top accent bar -->
            <div style="height:4px;background:#1a2744;border-radius:8px 8px 0 0;"></div>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:36px 36px 0;">

                  <!-- Amount due -->
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Amount Due</p>
                  <p style="margin:0 0 6px;font-size:42px;font-weight:800;color:#1a2744;letter-spacing:-1px;line-height:1;">${fmt(amountOwed)}</p>
                  <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;">Requested by <strong style="color:#475569;font-weight:600;">${displayCreator}</strong></p>

                  <!-- Divider -->
                  <div style="height:1px;background:#f1f5f9;margin-bottom:28px;"></div>

                  <!-- Greeting -->
                  <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1e293b;">Dear ${displayRecipient},</p>
                  <p style="margin:0 0 28px;font-size:13px;color:#64748b;line-height:1.7;">
                    You have a pending payment for a shared expense. Please review the details below and settle at your earliest convenience.
                  </p>

                  <!-- Expense detail block -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e9edf2;border-radius:6px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:top;">
                              <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:5px;">${split.title}</div>
                              <div style="font-size:12px;color:#64748b;margin-bottom:${split.description ? '3px' : '0'};">${split.category}&nbsp;&nbsp;·&nbsp;&nbsp;${dateStr}</div>
                              ${split.description ? `<div style="font-size:12px;color:#94a3b8;">${split.description}</div>` : ''}
                            </td>
                            <td style="vertical-align:top;text-align:right;padding-left:16px;white-space:nowrap;">
                              <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Bill</div>
                              <div style="font-size:18px;font-weight:700;color:#1e293b;">${fmt(split.total_amount)}</div>
                            </td>
                          </tr>
                        </table>
                        <!-- Your share row -->
                        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e9edf2;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;vertical-align:middle;">Your share</td>
                              <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                                <span style="font-size:20px;font-weight:800;color:#1a2744;">${fmt(amountOwed)}</span>
                              </td>
                            </tr>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- Participants -->
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">All Participants</p>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tbody>${participantRows}</tbody>
                  </table>

                </td>
              </tr>

              <!-- CTA row -->
              <tr>
                <td style="padding:28px 36px 36px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="background:#1a2744;border-radius:6px;">
                        <a href="${appUrl}/splits" style="display:block;padding:14px 0;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;text-align:center;letter-spacing:0.02em;">View and Settle Payment</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 0 0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.7;text-align:center;">
              Sent by <strong style="color:#64748b;">${displayCreator}</strong> via Finance Tracker
              &nbsp;·&nbsp;
              <a href="${appUrl}" style="color:#94a3b8;text-decoration:none;">Open App</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`.trim()

  return { subject, html }
}
