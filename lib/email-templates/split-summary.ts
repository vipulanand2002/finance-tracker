export interface EmailParticipant {
  participant_name: string
  participant_email: string | null
  amount_owed: number
  is_paid: boolean
}

export interface EmailSplit {
  id: string
  title: string
  total_amount: number
  category: string
  date: string
  is_settled: boolean
  split_participants: EmailParticipant[]
}

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

export function buildSplitSummaryEmail(opts: {
  userName: string
  userEmail: string
  splits: EmailSplit[]
  appUrl: string
}): { subject: string; html: string } {
  const { userName, splits, appUrl } = opts

  const totalOwedToYou = splits.reduce((sum, s) => {
    return sum + s.split_participants
      .filter(p => !p.is_paid && p.participant_email !== opts.userEmail)
      .reduce((a, p) => a + p.amount_owed, 0)
  }, 0)

  const settledCount = splits.filter(s => s.is_settled).length
  const activeCount = splits.length - settledCount

  const subject = totalOwedToYou > 0
    ? `💸 ${fmt(totalOwedToYou)} is owed to you — Split Summary`
    : `✅ Your Split Summary — All Clear!`

  const splitCards = splits.map(split => {
    const pending = split.split_participants.filter(p => !p.is_paid)
    const paid = split.split_participants.filter(p => p.is_paid)
    const totalPending = pending.reduce((s, p) => s + p.amount_owed, 0)
    const statusColor = split.is_settled ? '#10b981' : totalPending > 0 ? '#f59e0b' : '#10b981'
    const statusLabel = split.is_settled ? 'Settled' : totalPending > 0 ? 'Pending' : 'All Paid'

    const participantRows = split.split_participants.map(p => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;color:#1e293b;">${p.participant_name}</span>
          ${p.participant_email ? `<span style="font-size:11px;color:#94a3b8;margin-left:6px;">${p.participant_email}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">
          <span style="font-size:13px;font-weight:600;color:${p.is_paid ? '#10b981' : '#ef4444'};">${fmt(p.amount_owed)}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;padding-left:12px;">
          ${p.is_paid
            ? `<span style="display:inline-block;padding:2px 8px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:11px;font-weight:600;">Paid ✓</span>`
            : `<span style="display:inline-block;padding:2px 8px;background:#fef3c7;color:#d97706;border-radius:20px;font-size:11px;font-weight:600;">Pending</span>`
          }
        </td>
      </tr>
    `).join('')

    return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
          <div style="flex:1;">
            <div style="font-size:18px;margin-bottom:4px;">${categoryIcon(split.category)}&nbsp;<span style="font-size:15px;font-weight:700;color:#0f172a;">${split.title}</span></div>
            <div style="font-size:12px;color:#64748b;">${split.category} &nbsp;·&nbsp; ${new Date(split.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:12px;">
            <div style="font-size:20px;font-weight:800;color:#0f172a;">${fmt(split.total_amount)}</div>
            <div style="display:inline-block;padding:3px 10px;background:${statusColor}20;color:${statusColor};border-radius:20px;font-size:11px;font-weight:700;margin-top:4px;">${statusLabel}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;font-size:11px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Person</th>
              <th style="text-align:right;font-size:11px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
              <th style="text-align:right;font-size:11px;font-weight:600;color:#94a3b8;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;padding-left:12px;">Status</th>
            </tr>
          </thead>
          <tbody>${participantRows}</tbody>
        </table>
        ${totalPending > 0 && !split.is_settled ? `
          <div style="margin-top:12px;padding:10px 14px;background:#fef9ec;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#92400e;">
            💰 <strong>${fmt(totalPending)}</strong> still pending from ${pending.length} person${pending.length > 1 ? 's' : ''}
          </div>
        ` : ''}
      </div>
    `
  }).join('')

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Split Summary</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;">

  <!-- Email wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- ── HEADER LOGO BAR ── -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:40px;padding:10px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="font-size:18px;">💹</span>
                </div>
                <span style="font-size:17px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Finance<span style="color:#6366f1;">Tracker</span></span>
              </div>
            </td>
          </tr>

          <!-- ── HERO CARD ── -->
          <tr>
            <td style="padding-bottom:20px;">
              <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);border-radius:20px;padding:36px 32px;text-align:center;position:relative;overflow:hidden;">
                <!-- decorative circles -->
                <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
                <div style="position:absolute;bottom:-20px;left:-20px;width:80px;height:80px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>

                <div style="font-size:40px;margin-bottom:12px;">💸</div>
                <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Split Summary</h1>
                <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.85);">Hey ${userName.split(' ')[0]}, here's your complete split balance report</p>

                ${totalOwedToYou > 0 ? `
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:16px 28px;">
                    <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Total owed to you</div>
                    <div style="font-size:34px;font-weight:900;color:#ffffff;">${fmt(totalOwedToYou)}</div>
                  </div>
                ` : `
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:16px 28px;">
                    <div style="font-size:28px;margin-bottom:4px;">✅</div>
                    <div style="font-size:15px;font-weight:600;color:#ffffff;">All splits are settled!</div>
                  </div>
                `}
              </div>
            </td>
          </tr>

          <!-- ── STATS ROW ── -->
          <tr>
            <td style="padding-bottom:20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="32%" style="padding-right:8px;">
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                      <div style="font-size:24px;font-weight:800;color:#6366f1;">${splits.length}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;font-weight:500;">Total Splits</div>
                    </div>
                  </td>
                  <td width="32%" style="padding-right:4px;padding-left:4px;">
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                      <div style="font-size:24px;font-weight:800;color:#f59e0b;">${activeCount}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;font-weight:500;">Active</div>
                    </div>
                  </td>
                  <td width="32%" style="padding-left:8px;">
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                      <div style="font-size:24px;font-weight:800;color:#10b981;">${settledCount}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;font-weight:500;">Settled</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${splits.length === 0 ? `
          <!-- ── EMPTY STATE ── -->
          <tr>
            <td style="padding-bottom:20px;">
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:40px 32px;text-align:center;">
                <div style="font-size:48px;margin-bottom:12px;">🤝</div>
                <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px;">No splits yet</div>
                <div style="font-size:13px;color:#64748b;">Create your first split to track shared expenses.</div>
              </div>
            </td>
          </tr>
          ` : `
          <!-- ── SPLIT CARDS ── -->
          <tr>
            <td style="padding-bottom:20px;">
              <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">📋 Your Splits</div>
              ${splitCards}
            </td>
          </tr>
          `}

          <!-- ── CTA ── -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 32px;text-align:center;">
                <div style="font-size:22px;margin-bottom:8px;">📲</div>
                <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px;">View &amp; manage in the app</div>
                <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Mark payments, create new splits, and track everything in one place.</div>
                <a href="${appUrl}/splits" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:40px;letter-spacing:0.02em;box-shadow:0 4px 12px rgba(99,102,241,0.35);">
                  Open FinanceTracker →
                </a>
              </div>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="text-align:center;padding-bottom:16px;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">
                This email was sent to you because you use FinanceTracker to manage shared expenses.
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
