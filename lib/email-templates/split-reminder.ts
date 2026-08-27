function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function categoryIcon(cat: string): string {
  const map: Record<string, string> = {
    'Food & Dining': '🍽️', 'Travel': '✈️', 'Shopping': '🛍️',
    'Entertainment': '🎬', 'Utilities': '💡', 'Health': '🏥',
    'Education': '📚', 'Transport': '🚗', 'Other': '💰',
  }
  return map[cat] ?? '💰'
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

  const subject = `💸 You owe ${fmt(amountOwed)} — ${split.title}`
  const icon = categoryIcon(split.category)
  const dateStr = new Date(split.date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const participantRows = allParticipants.map(p => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);text-align:center;line-height:32px;font-size:13px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${p.name}</div>
          ${p.email ? `<div style="font-size:11px;color:#94a3b8;">${p.email}</div>` : ''}
        </span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;">
        <span style="font-size:14px;font-weight:700;color:${p.is_paid ? '#10b981' : '#ef4444'};">${fmt(p.amount_owed)}</span>
      </td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;">
        ${p.is_paid
          ? `<span style="display:inline-block;padding:3px 10px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:11px;font-weight:700;">Paid ✓</span>`
          : `<span style="display:inline-block;padding:3px 10px;background:#fee2e2;color:#dc2626;border-radius:20px;font-size:11px;font-weight:700;">Pending</span>`
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
  <title>Split Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

        <!-- ══ LOGO ══ -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <div style="display:inline-block;background:#ffffff;border:1px solid #e2e8f0;border-radius:40px;padding:10px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              <span style="display:inline-block;width:34px;height:34px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:9px;text-align:center;line-height:34px;font-size:17px;vertical-align:middle;">💹</span>
              <span style="display:inline-block;font-size:17px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;vertical-align:middle;margin-left:10px;">Finance<span style="color:#6366f1;">Tracker</span></span>
            </div>
          </td>
        </tr>

        <!-- ══ HERO ══ -->
        <tr>
          <td style="padding-bottom:20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#ef4444 0%,#f97316 60%,#f59e0b 100%);border-radius:22px;">
              <tr>
                <td align="center" style="padding:38px 32px;">
                  <div style="font-size:44px;line-height:1;margin-bottom:10px;">${icon}</div>
                  <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Payment Reminder</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-bottom:24px;">from <strong style="color:#ffffff;">${displayCreator}</strong></div>

                  <!-- Amount box -->
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:18px;padding:20px 32px;">
                    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">You owe</div>
                    <div style="font-size:40px;font-weight:900;color:#ffffff;line-height:1;">${fmt(amountOwed)}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ GREETING ══ -->
        <tr>
          <td style="padding-bottom:16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#0f172a;">Hi ${displayRecipient} 👋</p>
                  <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
                    <strong style="color:#0f172a;">${displayCreator}</strong> has sent you a payment reminder for a shared expense. Here are the details:
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SPLIT DETAIL CARD ══ -->
        <tr>
          <td style="padding-bottom:16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
              <tr>
                <td style="padding:24px 28px;">

                  <!-- Title row -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                    <tr>
                      <td style="vertical-align:top;">
                        <div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px;">${icon} ${split.title}</div>
                        <div style="font-size:12px;color:#64748b;">${split.category}&nbsp;·&nbsp;${dateStr}</div>
                        ${split.description ? `<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:2px;">${split.description}</div>` : ''}
                      </td>
                      <td style="vertical-align:top;text-align:right;padding-left:16px;white-space:nowrap;">
                        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;margin-bottom:2px;">Total Bill</div>
                        <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmt(split.total_amount)}</div>
                      </td>
                    </tr>
                  </table>

                  <!-- Your share callout -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:20px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;">
                              <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">Your Share</div>
                              <div style="font-size:12px;color:#78350f;">Please settle as soon as possible</div>
                            </td>
                            <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
                              <span style="font-size:26px;font-weight:900;color:#b45309;">${fmt(amountOwed)}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Participants -->
                  <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">All Participants</div>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <thead>
                      <tr>
                        <th style="text-align:left;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Person</th>
                        <th style="text-align:right;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
                        <th style="text-align:right;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;padding-left:12px;">Status</th>
                      </tr>
                    </thead>
                    <tbody>${participantRows}</tbody>
                  </table>

                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ CTA ══ -->
        <tr>
          <td style="padding-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
              <tr>
                <td align="center" style="padding:32px;">
                  <div style="font-size:28px;margin-bottom:10px;">💳</div>
                  <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px;">Settle up on FinanceTracker</div>
                  <div style="font-size:13px;color:#64748b;margin-bottom:22px;">Track all your shared expenses and manage payments in one place.</div>
                  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td align="center" style="background:linear-gradient(135deg,#ef4444,#f97316);border-radius:40px;box-shadow:0 4px 14px rgba(239,68,68,0.35);">
                        <a href="${appUrl}/splits" style="display:block;padding:14px 40px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">View &amp; Settle →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td align="center" style="padding-bottom:16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
              This reminder was sent by <strong>${displayCreator}</strong> via FinanceTracker.
            </p>
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              © ${new Date().getFullYear()} FinanceTracker &nbsp;·&nbsp;
              <a href="${appUrl}" style="color:#6366f1;text-decoration:none;">Open App</a>
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
