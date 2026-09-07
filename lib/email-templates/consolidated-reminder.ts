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
    ? `💸 You owe ${fmt(splits[0].amountOwed)} — ${splits[0].title}`
    : `💸 You owe ${fmt(totalOwed)} across ${splitCount} splits — reminder from ${displayCreator}`

  const splitCards = splits.map((sp, idx) => {
    const icon = categoryIcon(sp.category)
    const dateStr = new Date(sp.date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })

    const participantRows = sp.allParticipants.map(p => `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #f1f5f9;vertical-align:middle;">
          <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);text-align:center;line-height:26px;font-size:11px;font-weight:700;color:#fff;vertical-align:middle;">${p.name.charAt(0).toUpperCase()}</span>
          <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:12px;color:#374151;">${p.name}</span>
        </td>
        <td style="padding:8px 0 8px 8px;border-top:1px solid #f1f5f9;text-align:right;vertical-align:middle;white-space:nowrap;">
          <span style="font-size:13px;font-weight:700;color:${p.is_paid ? '#10b981' : '#ef4444'};">${fmt(p.amount_owed)}</span>
          &nbsp;
          ${p.is_paid
            ? `<span style="display:inline-block;padding:1px 8px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:10px;font-weight:700;">Paid ✓</span>`
            : `<span style="display:inline-block;padding:1px 8px;background:#fee2e2;color:#dc2626;border-radius:20px;font-size:10px;font-weight:700;">Pending</span>`
          }
        </td>
      </tr>
    `).join('')

    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;margin-bottom:10px;border:1px solid #e2e8f0;">
        <tr>
          <td style="padding:16px 18px;">
            <!-- Split header -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
              <tr>
                <td style="width:3px;background:linear-gradient(180deg,#ef4444,#f97316);border-radius:4px;vertical-align:top;">&nbsp;</td>
                <td style="padding-left:12px;vertical-align:top;">
                  <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:2px;">${icon} ${sp.title}</div>
                  <div style="font-size:11px;color:#94a3b8;">${sp.category}&nbsp;·&nbsp;${dateStr}</div>
                  ${sp.description ? `<div style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:1px;">${sp.description}</div>` : ''}
                </td>
                <td style="text-align:right;vertical-align:top;padding-left:8px;white-space:nowrap;">
                  <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.06em;margin-bottom:1px;">Bill Total</div>
                  <div style="font-size:16px;font-weight:800;color:#0f172a;">${fmt(sp.total_amount)}</div>
                </td>
              </tr>
            </table>
            <!-- Your share callout -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border-left:3px solid #f97316;border-radius:0 8px 8px 0;margin-bottom:12px;">
              <tr>
                <td style="padding:10px 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:10px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.06em;">Your Share — Split ${idx + 1}</div>
                      </td>
                      <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                        <span style="font-size:20px;font-weight:900;color:#ea580c;">${fmt(sp.amountOwed)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <!-- Participants -->
            <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Participants</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tbody>${participantRows}</tbody>
            </table>
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
                <td style="vertical-align:middle;"><img src="${appUrl}/icons/icon-192.png" width="38" height="38" alt="" style="display:inline-block;vertical-align:middle;border-radius:9px;"/></td>
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
                <td align="center" style="padding:30px 32px;">
                  <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px;">Payment Reminder</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:20px;">from <strong style="color:#ffffff;">${displayCreator}</strong></div>
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:16px 36px;">
                    <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                      Total You Owe${splitCount > 1 ? ` (${splitCount} splits)` : ''}
                    </div>
                    <div style="font-size:38px;font-weight:900;color:#ffffff;line-height:1;letter-spacing:-1px;">${fmt(totalOwed)}</div>
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
                <td style="padding:18px 20px;">
                  <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;">Hi ${displayRecipient} 👋</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">
                    <strong style="color:#374151;">${displayCreator}</strong> is sending you a payment reminder for
                    ${splitCount === 1
                      ? 'a shared expense below.'
                      : `<strong style="color:#374151;">${splitCount} shared expenses</strong> below. Please settle each one at your earliest convenience.`}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SPLIT CARDS ══ -->
        <tr>
          <td style="padding:12px 16px 0;">
            ${splitCards}
          </td>
        </tr>

        ${splitCount > 1 ? `
        <!-- ══ GRAND TOTAL ══ -->
        <tr>
          <td style="padding:0 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;border-radius:12px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;">Grand Total Owed</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">${splitCount} splits combined</div>
                      </td>
                      <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
                        <span style="font-size:26px;font-weight:900;color:#f97316;">${fmt(totalOwed)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- ══ CTA ══ -->
        <tr>
          <td style="padding:12px 16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;">
              <tr>
                <td align="center" style="padding:22px 24px;">
                  <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Ready to settle?</div>
                  <div style="font-size:12px;color:#94a3b8;margin-bottom:18px;">Open the app to mark your payments and close these requests.</div>
                  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td align="center" style="background:linear-gradient(135deg,#ef4444,#f97316);border-radius:40px;box-shadow:0 4px 14px rgba(239,68,68,0.3);">
                        <a href="${appUrl}/splits" style="display:block;padding:12px 40px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">View &amp; Settle →</a>
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
          <td align="center" style="padding:20px 20px 26px;">
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
