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

const APP_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="38" height="38" style="display:inline-block;vertical-align:middle;border-radius:9px;"><rect width="512" height="512" rx="80" fill="#09090b"/><path d="M160 320 L256 160 L352 320" stroke="#22c55e" stroke-width="32" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="160" r="20" fill="#22c55e"/><path d="M140 360 H372" stroke="#22c55e" stroke-width="20" stroke-linecap="round"/></svg>`

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
      <td style="padding:12px 0;border-top:1px solid #f1f5f9;vertical-align:middle;">
        <span style="display:inline-block;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);text-align:center;line-height:34px;font-size:14px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${p.name}</div>
          ${p.email ? `<div style="font-size:11px;color:#94a3b8;">${p.email}</div>` : ''}
        </span>
      </td>
      <td style="padding:12px 0 12px 12px;border-top:1px solid #f1f5f9;text-align:right;vertical-align:middle;white-space:nowrap;">
        <span style="font-size:14px;font-weight:700;color:${p.is_paid ? '#10b981' : '#ef4444'};display:block;margin-bottom:4px;">${fmt(p.amount_owed)}</span>
        ${p.is_paid
          ? `<span style="display:inline-block;padding:2px 10px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:10px;font-weight:700;">Paid ✓</span>`
          : `<span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:20px;font-size:10px;font-weight:700;">Pending</span>`
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

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:0;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

        <!-- ══ HEADER BAR ══ -->
        <tr>
          <td style="background:#ffffff;border-bottom:1px solid #f1f5f9;padding:14px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">${APP_LOGO_SVG}</td>
                <td style="text-align:right;vertical-align:middle;">
                  <a href="${appUrl}" style="font-size:12px;font-weight:600;color:#6366f1;text-decoration:none;border:1px solid #c7d2fe;border-radius:20px;padding:5px 14px;">Open App →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ HERO ══ -->
        <tr>
          <td style="padding:16px 16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#ef4444 0%,#f97316 58%,#f59e0b 100%);border-radius:16px;">
              <tr>
                <td align="center" style="padding:34px 32px;">
                  <div style="font-size:40px;line-height:1;margin-bottom:10px;">${icon}</div>
                  <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px;">Payment Reminder</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:22px;">from <strong style="color:#ffffff;">${displayCreator}</strong></div>
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:18px 36px;">
                    <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:5px;">You owe</div>
                    <div style="font-size:42px;font-weight:900;color:#ffffff;line-height:1;letter-spacing:-1px;">${fmt(amountOwed)}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ GREETING ══ -->
        <tr>
          <td style="padding:12px 16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;">
              <tr>
                <td style="padding:20px 22px;">
                  <p style="margin:0 0 7px;font-size:15px;font-weight:700;color:#0f172a;">Hi ${displayRecipient} 👋</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">
                    <strong style="color:#374151;">${displayCreator}</strong> has sent you a payment reminder for a shared expense. Please review the details below.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SPLIT DETAIL CARD ══ -->
        <tr>
          <td style="padding:12px 16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;">
              <tr>
                <td style="padding:20px 22px;">

                  <!-- Title row with left accent bar -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                    <tr>
                      <td style="width:3px;background:linear-gradient(180deg,#ef4444,#f97316);border-radius:4px;vertical-align:top;">&nbsp;</td>
                      <td style="padding-left:14px;vertical-align:top;">
                        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:3px;">${icon} ${split.title}</div>
                        <div style="font-size:12px;color:#94a3b8;">${split.category}&nbsp;·&nbsp;${dateStr}</div>
                        ${split.description ? `<div style="font-size:12px;color:#94a3b8;font-style:italic;margin-top:2px;">${split.description}</div>` : ''}
                      </td>
                      <td style="text-align:right;vertical-align:top;padding-left:12px;white-space:nowrap;">
                        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.06em;margin-bottom:2px;">Total Bill</div>
                        <div style="font-size:20px;font-weight:800;color:#0f172a;">${fmt(split.total_amount)}</div>
                      </td>
                    </tr>
                  </table>

                  <!-- Your share — left-border callout -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border-left:3px solid #f97316;border-radius:0 10px 10px 0;margin-bottom:18px;">
                    <tr>
                      <td style="padding:13px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;">
                              <div style="font-size:10px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Your Share</div>
                              <div style="font-size:12px;color:#c2410c;">Please settle as soon as possible</div>
                            </td>
                            <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                              <span style="font-size:24px;font-weight:900;color:#ea580c;">${fmt(amountOwed)}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Participants -->
                  <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">All Participants</div>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tbody>${participantRows}</tbody>
                  </table>

                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ CTA ══ -->
        <tr>
          <td style="padding:12px 16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;">
              <tr>
                <td align="center" style="padding:26px 24px;">
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:5px;">Ready to settle?</div>
                  <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;">Open the app to mark your payment and close this request.</div>
                  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td align="center" style="background:linear-gradient(135deg,#ef4444,#f97316);border-radius:40px;box-shadow:0 4px 14px rgba(239,68,68,0.3);">
                        <a href="${appUrl}/splits" style="display:block;padding:13px 44px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">View &amp; Settle →</a>
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
          <td align="center" style="padding:22px 20px 26px;">
            <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">
              Sent by <strong style="color:#64748b;">${displayCreator}</strong> on behalf of Finance Tracker
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e1;">
              <a href="${appUrl}" style="color:#6366f1;text-decoration:none;">Open App</a>
              &nbsp;·&nbsp;
              <a href="${appUrl}" style="color:#94a3b8;text-decoration:none;">Unsubscribe</a>
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
