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

  const subject = `💸 You owe ${fmt(amountOwed)} — ${split.title}`

  const participantRows = allParticipants.map(p => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:13px;font-weight:700;color:#fff;">${p.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#0f172a;">${p.name}${p.email === opts.appUrl ? '' : ''}</div>
            ${p.email ? `<div style="font-size:11px;color:#94a3b8;">${p.email}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;">
        <div style="font-size:14px;font-weight:700;color:${p.is_paid ? '#10b981' : '#ef4444'};">${fmt(p.amount_owed)}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;padding-left:12px;">
        ${p.is_paid
          ? `<span style="display:inline-block;padding:3px 10px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:11px;font-weight:700;">Paid ✓</span>`
          : `<span style="display:inline-block;padding:3px 10px;background:#fee2e2;color:#dc2626;border-radius:20px;font-size:11px;font-weight:700;">Pending</span>`
        }
      </td>
    </tr>
  `).join('')

  const icon = categoryIcon(split.category)
  const dateStr = new Date(split.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Split Reminder</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

        <!-- LOGO -->
        <tr>
          <td style="padding-bottom:24px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:40px;padding:10px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              <div style="width:34px;height:34px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:9px;display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:17px;">💹</span>
              </div>
              <span style="font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Finance<span style="color:#6366f1;">Tracker</span></span>
            </div>
          </td>
        </tr>

        <!-- HERO -->
        <tr>
          <td style="padding-bottom:20px;">
            <div style="background:linear-gradient(135deg,#ef4444 0%,#f97316 60%,#f59e0b 100%);border-radius:22px;padding:38px 32px;text-align:center;position:relative;overflow:hidden;">
              <div style="position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:rgba(255,255,255,0.07);border-radius:50%;"></div>
              <div style="position:absolute;bottom:-30px;left:-30px;width:100px;height:100px;background:rgba(255,255,255,0.05);border-radius:50%;"></div>
              <div style="font-size:44px;margin-bottom:10px;">${icon}</div>
              <h1 style="margin:0 0 6px;font-size:15px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.02em;text-transform:uppercase;">Payment Reminder</h1>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-bottom:22px;">from <strong style="color:#fff;">${creatorName}</strong></div>
              <div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:18px;padding:20px 32px;display:inline-block;">
                <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">You owe</div>
                <div style="font-size:40px;font-weight:900;color:#ffffff;line-height:1;">${fmt(amountOwed)}</div>
              </div>
            </div>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="padding-bottom:16px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;">
              <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">Hi ${recipientName} 👋</p>
              <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
                <strong>${creatorName}</strong> has sent you a payment reminder for a shared expense.
                Here are the details:
              </p>
            </div>
          </td>
        </tr>

        <!-- SPLIT DETAILS -->
        <tr>
          <td style="padding-bottom:16px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
                <div>
                  <div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px;">${icon} ${split.title}</div>
                  <div style="font-size:12px;color:#64748b;">${split.category} &nbsp;·&nbsp; ${dateStr}</div>
                  ${split.description ? `<div style="font-size:12px;color:#64748b;margin-top:2px;font-style:italic;">${split.description}</div>` : ''}
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Total Bill</div>
                  <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmt(split.total_amount)}</div>
                </div>
              </div>

              <!-- YOUR SHARE CALLOUT -->
              <div style="background:linear-gradient(135deg,#fef3c7,#fff7ed);border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div>
                    <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">Your Share</div>
                    <div style="font-size:13px;color:#78350f;margin-top:2px;">Please settle as soon as possible</div>
                  </div>
                  <div style="font-size:26px;font-weight:900;color:#b45309;">${fmt(amountOwed)}</div>
                </div>
              </div>

              <!-- ALL PARTICIPANTS -->
              <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">All Participants</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Person</th>
                    <th style="text-align:right;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
                    <th style="text-align:right;font-size:10px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;padding-left:12px;">Status</th>
                  </tr>
                </thead>
                <tbody>${participantRows}</tbody>
              </table>
            </div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding-bottom:24px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 32px;text-align:center;">
              <div style="font-size:22px;margin-bottom:10px;">💳</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px;">Settle up on FinanceTracker</div>
              <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Track all your shared expenses and manage payments in one place.</div>
              <a href="${appUrl}/splits"
                 style="display:inline-block;background:linear-gradient(135deg,#ef4444,#f97316);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:40px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(239,68,68,0.35);">
                View &amp; Settle →
              </a>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="text-align:center;padding-bottom:16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
              This reminder was sent by <strong>${creatorName}</strong> via FinanceTracker.
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
</html>
  `.trim()

  return { subject, html }
}
