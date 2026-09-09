function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface ConsolidatedSplitItem {
  title: string
  total_amount: number
  category: string
  date: string
  description: string | null
  amountOwed: number
  allParticipants: { name: string; email: string; amount_owed: number; is_paid: boolean }[]
}

export function buildConsolidatedReminderEmail(opts: {
  recipientName: string
  creatorName: string
  splits: ConsolidatedSplitItem[]
  appUrl: string
}): { subject: string; html: string } {
  const { recipientName, creatorName, splits, appUrl } = opts

  const displayCreator = capitalize(creatorName)
  const displayRecipient = capitalize(recipientName.split(' ')[0])
  const totalOwed = splits.reduce((s, sp) => s + sp.amountOwed, 0)
  const splitCount = splits.length

  const subject = splitCount === 1
    ? `Payment Reminder: ${splits[0].title} — ${fmt(splits[0].amountOwed)} due`
    : `Payment Reminder: ${fmt(totalOwed)} due across ${splitCount} expenses`

  const splitCards = splits.map((sp, idx) => {
    const dateStr = new Date(sp.date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })

    const participantRows = sp.allParticipants.map(p => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#334155;text-align:center;line-height:26px;font-size:11px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
          <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:12px;color:#374151;">${p.name}</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;white-space:nowrap;">
          <div style="font-size:12px;font-weight:600;color:${p.is_paid ? '#16a34a' : '#1e293b'};">${fmt(p.amount_owed)}</div>
          <div style="font-size:10px;font-weight:600;color:${p.is_paid ? '#16a34a' : '#94a3b8'};text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">${p.is_paid ? 'Paid' : 'Pending'}</div>
        </td>
      </tr>
    `).join('')

    return `
      <!-- Expense ${idx + 1} -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e9edf2;border-radius:6px;margin-bottom:12px;">
        <tr>
          <td style="padding:16px 18px;">

            <!-- Header row: index + title + total -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td style="vertical-align:top;">
                  <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${idx + 1} of ${splitCount}</div>
                  <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:3px;">${sp.title}</div>
                  <div style="font-size:11px;color:#64748b;">${sp.category}&nbsp;·&nbsp;${dateStr}</div>
                  ${sp.description ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${sp.description}</div>` : ''}
                </td>
                <td style="vertical-align:top;text-align:right;padding-left:12px;white-space:nowrap;">
                  <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Bill Total</div>
                  <div style="font-size:16px;font-weight:700;color:#1e293b;">${fmt(sp.total_amount)}</div>
                </td>
              </tr>
            </table>

            <!-- Your share -->
            <div style="padding-top:10px;border-top:1px solid #e9edf2;margin-bottom:10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;vertical-align:middle;">Your Share</td>
                  <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                    <span style="font-size:17px;font-weight:800;color:#1a2744;">${fmt(sp.amountOwed)}</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Participants -->
            <div style="padding-top:10px;border-top:1px solid #e9edf2;">
              <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Participants</div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tbody>${participantRows}</tbody>
              </table>
            </div>

          </td>
        </tr>
      </table>
    `
  }).join('')

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

                  <!-- Total amount due -->
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">
                    ${splitCount > 1 ? `Total Due — ${splitCount} Expenses` : 'Amount Due'}
                  </p>
                  <p style="margin:0 0 6px;font-size:42px;font-weight:800;color:#1a2744;letter-spacing:-1px;line-height:1;">${fmt(totalOwed)}</p>
                  <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;">Requested by <strong style="color:#475569;font-weight:600;">${displayCreator}</strong></p>

                  <!-- Divider -->
                  <div style="height:1px;background:#f1f5f9;margin-bottom:28px;"></div>

                  <!-- Greeting -->
                  <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1e293b;">Dear ${displayRecipient},</p>
                  <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.7;">
                    You have ${splitCount === 1 ? 'a pending payment' : `<strong style="color:#1e293b;">${splitCount} pending payments</strong>`} for shared expenses. Please review each item below and settle at your earliest convenience.
                  </p>

                  <!-- Split cards -->
                  ${splitCards}

                  ${splitCount > 1 ? `
                  <!-- Grand total row -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                    <tr>
                      <td style="padding:14px 18px;background:#f1f5f9;border-radius:6px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;vertical-align:middle;">Total Outstanding</td>
                            <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                              <span style="font-size:22px;font-weight:800;color:#1a2744;">${fmt(totalOwed)}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                </td>
              </tr>

              <!-- CTA row -->
              <tr>
                <td style="padding:24px 36px 36px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="background:#1a2744;border-radius:6px;">
                        <a href="${appUrl}/splits" style="display:block;padding:14px 0;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;text-align:center;letter-spacing:0.02em;">View and Settle Payments</a>
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
