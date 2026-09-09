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
      <td style="padding:11px 0;border-top:1px solid #f1f5f9;vertical-align:middle;">
        <span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:#1e293b;text-align:center;line-height:32px;font-size:13px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${p.name}</div>
          ${p.email ? `<div style="font-size:11px;color:#94a3b8;">${p.email}</div>` : ''}
        </span>
      </td>
      <td style="padding:11px 0 11px 12px;border-top:1px solid #f1f5f9;text-align:right;vertical-align:middle;white-space:nowrap;">
        <span style="font-size:14px;font-weight:700;color:${p.is_paid ? '#16a34a' : '#dc2626'};display:block;margin-bottom:4px;">${fmt(p.amount_owed)}</span>
        ${p.is_paid
          ? `<span style="display:inline-block;padding:2px 10px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Paid</span>`
          : `<span style="display:inline-block;padding:2px 10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Pending</span>`
        }
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
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td style="background:#0f172a;border-radius:10px 10px 0 0;padding:20px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Finance Tracker</span>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <a href="${appUrl}" style="font-size:11px;font-weight:600;color:#94a3b8;text-decoration:none;letter-spacing:0.04em;text-transform:uppercase;">Open App</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- AMOUNT BANNER -->
        <tr>
          <td style="background:#1e293b;padding:32px 28px 28px;">
            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Payment Reminder from ${displayCreator}</div>
            <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Amount Due</div>
            <div style="font-size:40px;font-weight:800;color:#ffffff;letter-spacing:-1.5px;line-height:1;">${fmt(amountOwed)}</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:28px;">

            <!-- Greeting -->
            <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
              Dear ${displayRecipient},<br/><br/>
              This is a payment reminder from <strong style="color:#0f172a;">${displayCreator}</strong> for a shared expense. Kindly review the details below and settle at your earliest convenience.
            </p>

            <!-- Divider -->
            <div style="height:1px;background:#e2e8f0;margin-bottom:20px;"></div>

            <!-- Split details -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td style="border-left:3px solid #0f172a;padding-left:14px;vertical-align:top;">
                  <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px;">${split.title}</div>
                  <div style="font-size:12px;color:#64748b;">${split.category}&nbsp;&nbsp;|&nbsp;&nbsp;${dateStr}</div>
                  ${split.description ? `<div style="font-size:12px;color:#64748b;margin-top:3px;">${split.description}</div>` : ''}
                </td>
                <td style="text-align:right;vertical-align:top;padding-left:12px;white-space:nowrap;">
                  <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.06em;margin-bottom:3px;">Total Bill</div>
                  <div style="font-size:20px;font-weight:700;color:#0f172a;">${fmt(split.total_amount)}</div>
                </td>
              </tr>
            </table>

            <!-- Your share -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Your Share</div>
                      </td>
                      <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                        <span style="font-size:22px;font-weight:800;color:#dc2626;">${fmt(amountOwed)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Participants -->
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">All Participants</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tbody>${participantRows}</tbody>
            </table>

            <!-- Divider -->
            <div style="height:1px;background:#e2e8f0;margin:24px 0 20px;"></div>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#0f172a;border-radius:6px;">
                  <a href="${appUrl}/splits" style="display:block;padding:12px 28px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">View and Settle</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 10px 10px;padding:16px 28px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
              This reminder was sent by <strong style="color:#64748b;">${displayCreator}</strong> via Finance Tracker.
              &nbsp;&nbsp;
              <a href="${appUrl}" style="color:#64748b;text-decoration:underline;">Open App</a>
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
