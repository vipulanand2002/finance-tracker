'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Scale,
  Receipt, Users, MessageCircle, Bot, Tag,
  CreditCard, Bell, ShieldCheck, Plane, Camera,
  ArrowRight, Check, BarChart3, Sparkles, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'

// ── Mock data ──────────────────────────────────────────────────────────────────

const trendData = [
  { month: 'Feb', income: 75000, expenses: 48200 },
  { month: 'Mar', income: 75000, expenses: 53800 },
  { month: 'Apr', income: 82000, expenses: 41500 },
  { month: 'May', income: 75000, expenses: 55200 },
  { month: 'Jun', income: 90000, expenses: 44700 },
  { month: 'Jul', income: 85000, expenses: 42350 },
]

const categoryData = [
  { category: 'Food & Dining', amount: 12400 },
  { category: 'Rent & Housing', amount: 18000 },
  { category: 'Transportation', amount: 4200 },
  { category: 'Entertainment', amount: 3800 },
  { category: 'Shopping', amount: 2950 },
  { category: 'Utilities', amount: 1000 },
]

const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#f97316',
  'Rent & Housing': '#ef4444',
  'Transportation': '#3b82f6',
  'Entertainment': '#a855f7',
  'Shopping': '#ec4899',
  'Utilities': '#eab308',
  'Salary': '#22c55e',
  'Freelance': '#10b981',
  'Subscriptions': '#64748b',
  'Travel': '#06b6d4',
}

const transactions = [
  { id: 1, description: 'Room in Anjuna', category: 'Travel', amount: -15225, date: 'Sep 8', card: 'Amazon Pay ••1234', split: true },
  { id: 2, description: 'Swiggy — Dinner', category: 'Food & Dining', amount: -480, date: 'Jul 25', card: null, split: false },
  { id: 3, description: 'Salary — Infosys', category: 'Salary', amount: 85000, date: 'Jul 24', card: null, split: false },
  { id: 4, description: 'Uber — Office', category: 'Transportation', amount: -220, date: 'Jul 24', card: 'HDFC Regalia ••5678', split: false },
  { id: 5, description: 'Netflix', category: 'Subscriptions', amount: -649, date: 'Jul 23', card: null, split: false },
  { id: 6, description: 'Monster for everyone', category: 'Food & Dining', amount: -610, date: 'Sep 9', card: 'Amazon Pay ••1234', split: false },
  { id: 7, description: 'Zepto — Groceries', category: 'Shopping', amount: -1850, date: 'Jul 22', card: null, split: false },
  { id: 8, description: 'Freelance — UI Project', category: 'Freelance', amount: 15000, date: 'Jul 20', card: null, split: false },
]

const splits = [
  {
    id: 1,
    title: 'Goa Trip — Hotel',
    totalAmount: 24000,
    category: 'Travel',
    date: 'Sep 8',
    participants: [
      { name: 'You', amount: 6000, paid: true, initials: 'YO' },
      { name: 'Rahul', amount: 6000, paid: true, initials: 'RK' },
      { name: 'Priya', amount: 6000, paid: false, initials: 'PS' },
      { name: 'Ankit', amount: 6000, paid: false, initials: 'AV' },
    ],
  },
  {
    id: 2,
    title: 'Dinner — Social Kitchen',
    totalAmount: 3200,
    category: 'Food & Dining',
    date: 'Jul 22',
    participants: [
      { name: 'You', amount: 800, paid: true, initials: 'YO' },
      { name: 'Sneha', amount: 800, paid: true, initials: 'SM' },
      { name: 'Arjun', amount: 800, paid: false, initials: 'AR' },
      { name: 'Dev', amount: 800, paid: true, initials: 'DK' },
    ],
  },
]

const chatMessages = [
  { id: 1, from: 'them', name: 'Rahul', text: 'Hey! Created a split for Goa hotel 🏖️', time: '10:30 AM' },
  {
    id: 2, from: 'them', name: 'Rahul', type: 'split',
    split: { title: 'Goa Trip — Hotel', totalAmount: 24000, yourShare: 6000, category: 'Travel' },
    time: '10:30 AM',
  },
  { id: 3, from: 'me', text: 'Paid! Looking forward to it 🎉', time: '10:32 AM' },
  { id: 4, from: 'them', name: 'Rahul', text: "Awesome! Let's meet at airport at 6am 🛫", time: '10:33 AM' },
]

const aiChat = [
  { role: 'user', text: 'What did I spend the most on this month?' },
  { role: 'ai', text: "Your biggest expense is **Rent & Housing** at ₹18,000 (42.5%), followed by **Food & Dining** at ₹12,400 (29.3%). Both are within last month's ranges." },
  { role: 'user', text: 'How can I save more?' },
  { role: 'ai', text: 'You could save ~₹3,500/month by cutting **Entertainment** to ₹2,000 and consolidating 3 streaming subscriptions into 1.' },
]

const budgets = [
  { category: 'Food & Dining', limit: 15000, spent: 12400, color: '#f97316' },
  { category: 'Transportation', limit: 5000, spent: 4200, color: '#3b82f6' },
  { category: 'Entertainment', limit: 3000, spent: 3800, color: '#a855f7' },
  { category: 'Shopping', limit: 5000, spent: 2950, color: '#ec4899' },
]

const tripMembers = [
  { name: 'You', email: 'you@example.com', spent: 15225, pct: 72, splits: 6000, direct: 9225 },
  { name: 'Rahul', email: 'rahul@example.com', spent: 3200, pct: 15, splits: 800, direct: 2400 },
  { name: 'Priya', email: null, spent: 0, pct: 0, splits: 0, direct: 0, owes: 6000 },
  { name: 'Ankit', email: null, spent: 0, pct: 0, splits: 0, direct: 0, owes: 6000 },
]

const balances = [
  { name: 'Priya Sharma', email: 'priya@example.com', net: 6000, splitOwed: 6000, txnOwed: 0 },
  { name: 'Ankit Verma', email: null, net: 6000, splitOwed: 6000, txnOwed: 0 },
  { name: 'Rahul Kumar', email: 'rahul@example.com', net: 3200, splitOwed: 800, txnOwed: 2400 },
  { name: 'Sneha Mehta', email: 'sneha@example.com', net: -800, splitOwed: 0, txnOwed: 0 },
]

const features = [
  { icon: BarChart3, title: 'Smart Dashboard', desc: 'All-time balance, monthly KPIs, and spending trends at a glance.', color: 'text-blue-500' },
  { icon: TrendingUp, title: 'Spending Charts', desc: 'Daily, weekly, and 6-month trend lines with category breakdowns.', color: 'text-emerald-500' },
  { icon: Users, title: 'Expense Splits', desc: "Split bills with friends, track who's paid, send reminders.", color: 'text-violet-500' },
  { icon: Scale, title: 'Balances', desc: 'Net balance per friend across all splits and tagged transactions.', color: 'text-teal-500' },
  { icon: Plane, title: 'Trip Tracking', desc: 'Group travel with per-member spending, shared splits, and chat.', color: 'text-orange-500' },
  { icon: MessageCircle, title: 'Friends Chat', desc: 'Real-time chat — split cards auto-appear in conversations.', color: 'text-pink-500' },
  { icon: Bot, title: 'AI Assistant', desc: 'Ask anything about your finances. Gemini-powered spending insights.', color: 'text-amber-500' },
  { icon: Camera, title: 'Receipt Scanner', desc: 'Photograph a receipt — AI auto-fills amount, category, and date.', color: 'text-cyan-500' },
  { icon: CreditCard, title: 'Credit Card Tracking', desc: 'Tag any transaction with a card, track statements per cycle.', color: 'text-indigo-500' },
  { icon: Bell, title: 'Push Notifications', desc: 'Instant alerts when friends add you to a split or mark you paid.', color: 'text-red-500' },
  { icon: Tag, title: 'Custom Categories', desc: 'Add, rename, or delete expense and income categories any time.', color: 'text-teal-500' },
  { icon: ShieldCheck, title: 'Secure by Default', desc: 'Row-level security on every table — your data is only yours.', color: 'text-green-500' },
  { icon: Sparkles, title: 'Works Offline (PWA)', desc: 'Install as a native app on mobile — works without internet.', color: 'text-yellow-500' },
  { icon: PiggyBank, title: 'Budget Goals', desc: 'Set per-category budgets and get warned when you overspend.', color: 'text-lime-500' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n))
}

function fmtK(n: number) {
  return n >= 1000 ? `₹${(n / 1000).toFixed(0)}k` : `₹${n}`
}

function StatCard({ title, value, sub, icon: Icon, iconClass, positive }: {
  title: string; value: string; sub: string
  icon: React.ElementType; iconClass: string; positive?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
        <Icon className={`w-4 h-4 shrink-0 ml-1 ${iconClass}`} />
      </div>
      <p className={`text-base sm:text-xl font-bold truncate ${positive === false ? 'text-red-600' : positive === true ? 'text-emerald-600' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
    </div>
  )
}

// ── Section components ─────────────────────────────────────────────────────────

function DemoSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-emerald-500/40 bg-card p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Net Account Balance</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-1">{fmt(124500)}</p>
          <p className="text-xs text-muted-foreground mt-1">All-time surplus — you&apos;re ahead!</p>
        </div>
        <Scale className="w-8 h-8 sm:w-10 sm:h-10 opacity-20 text-emerald-500 shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Income This Month" value={fmt(85000)} sub="Total received" icon={TrendingUp} iconClass="text-emerald-500" positive={true} />
        <StatCard title="Expenses This Month" value={fmt(42350)} sub="Total spent" icon={TrendingDown} iconClass="text-red-500" positive={false} />
        <StatCard title="Net This Month" value={fmt(42650)} sub="Positive cashflow" icon={Wallet} iconClass="text-emerald-500" positive={true} />
        <StatCard title="Savings Rate" value="50.2%" sub="Great job!" icon={PiggyBank} iconClass="text-emerald-500" positive={true} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold mb-3">6-Month Trend</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="demoIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="demoExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={40} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Area type="monotone" dataKey="income" name="Income" stroke="#22c55e" fill="url(#demoIncome)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#demoExpense)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold mb-3">By Category — July</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={categoryData} dataKey="amount" nameKey="category"
                cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                {categoryData.map(({ category }) => (
                  <Cell key={category} fill={CAT_COLORS[category] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend formatter={v => <span className="text-[11px]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold mb-3">Budget Progress — July</p>
        <div className="space-y-3">
          {budgets.map(b => {
            const pct = Math.min((b.spent / b.limit) * 100, 100)
            const over = b.spent > b.limit
            return (
              <div key={b.category}>
                <div className="flex justify-between text-xs mb-1 gap-2">
                  <span className="font-medium truncate">{b.category}</span>
                  <span className={`shrink-0 ${over ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                    {fmtK(b.spent)} / {fmtK(b.limit)} {over && '⚠️'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? '#ef4444' : b.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TransactionsSection() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <p className="font-semibold text-sm">Recent Transactions</p>
        <span className="text-xs text-muted-foreground">Sep / Jul 2026</span>
      </div>
      <div className="divide-y">
        {transactions.map(t => {
          const color = CAT_COLORS[t.category] ?? '#94a3b8'
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: color + '22' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.description}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <p className="text-xs text-muted-foreground">{t.category} · {t.date}</p>
                  {t.card && (
                    <span className="flex items-center gap-0.5 text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5">
                      <CreditCard className="w-2.5 h-2.5" />
                      {t.card}
                    </span>
                  )}
                  {t.split && (
                    <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded px-1.5 py-0.5">
                      Split
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-sm font-semibold shrink-0 ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {t.amount > 0 ? '+' : '-'}{fmt(t.amount)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SplitsSection() {
  return (
    <div className="space-y-4">
      {splits.map(s => {
        const paidCount = s.participants.filter(p => p.paid).length
        return (
          <div key={s.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.category} · {s.date}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-base">{fmt(s.totalAmount)}</p>
                <p className="text-xs text-muted-foreground">{paidCount}/{s.participants.length} paid</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {s.participants.map(p => (
                <div key={p.name} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border ${p.paid ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800' : 'bg-muted border-transparent'}`}>
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                    {p.initials}
                  </div>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground hidden xs:inline">{fmt(p.amount)}</span>
                  {p.paid
                    ? <Check className="w-3 h-3 text-emerald-500" />
                    : <span className="text-amber-500 font-bold">·</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TripsSection() {
  const totalSpent = tripMembers.reduce((s, m) => s + m.spent, 0)
  return (
    <div className="space-y-4">
      {/* Trip card */}
      <div className="rounded-xl overflow-hidden border">
        <div className="relative h-36 bg-gradient-to-br from-violet-500 to-purple-700 flex flex-col justify-end p-4">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="relative">
            <p className="text-white text-lg font-bold">Goa Trip 2026</p>
            <p className="text-white/70 text-xs mt-0.5">Sep 8 – Sep 12 · 5 days</p>
          </div>
        </div>
        <div className="bg-card p-4 grid grid-cols-3 gap-3 text-center text-sm border-b">
          <div>
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className="font-bold text-red-600 mt-0.5">{fmt(totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Members</p>
            <p className="font-bold mt-0.5">{tripMembers.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Splits</p>
            <p className="font-bold mt-0.5">2</p>
          </div>
        </div>

        {/* Members tab */}
        <div className="bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members — Spending</p>
          {tripMembers.map(m => {
            const pct = totalSpent > 0 ? (m.spent / totalSpent) * 100 : 0
            return (
              <div key={m.name} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-xs shrink-0">
                      {m.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name === 'You' ? <span>{m.name} <span className="text-muted-foreground font-normal text-xs">(you)</span></span> : m.name}</p>
                      {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {m.spent > 0
                      ? <p className="text-sm font-bold text-red-600">{fmt(m.spent)}</p>
                      : <p className="text-sm text-muted-foreground">—</p>}
                    {m.spent > 0 && <p className="text-[10px] text-muted-foreground">{Math.round(pct)}% of trip</p>}
                  </div>
                </div>
                {m.spent > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {'owes' in m && m.owes && m.owes > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Owes: <span className="font-medium">{fmt(m.owes)}</span></p>
                )}
                {m.spent > 0 && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {m.splits > 0 && <span>Splits: <span className="font-medium text-foreground">{fmt(m.splits)}</span></span>}
                    {m.direct > 0 && <span>Direct: <span className="font-medium text-foreground">{fmt(m.direct)}</span></span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BalancesSection() {
  const owedToYou = balances.filter(b => b.net > 0).reduce((s, b) => s + b.net, 0)
  const youOwe = balances.filter(b => b.net < 0).reduce((s, b) => s + Math.abs(b.net), 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 px-4 py-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Friends owe you</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{fmt(owedToYou)}</p>
        </div>
        <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 px-4 py-3">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">You owe friends</p>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">{fmt(youOwe)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {balances.map(b => (
          <div key={b.name} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                  {b.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{b.name}</p>
                  {b.email && <p className="text-xs text-muted-foreground truncate">{b.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {b.net > 0 ? (
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-emerald-600 font-semibold text-sm">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      {fmt(b.net)}
                    </div>
                    <p className="text-xs text-muted-foreground">owes you</p>
                  </div>
                ) : (
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-blue-600 font-semibold text-sm">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      {fmt(Math.abs(b.net))}
                    </div>
                    <p className="text-xs text-muted-foreground">you owe</p>
                  </div>
                )}
              </div>
            </div>
            {(b.splitOwed > 0 || b.txnOwed > 0) && (
              <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {b.splitOwed > 0 && <span>Splits: <span className="font-medium text-foreground">{fmt(b.splitOwed)}</span></span>}
                {b.txnOwed > 0 && <span>Expenses: <span className="font-medium text-foreground">{fmt(b.txnOwed)}</span></span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatSection() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col" style={{ height: '460px' }}>
      <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">RK</div>
        <p className="text-sm font-semibold">Rahul Kumar</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3">
        {chatMessages.map(m => (
          <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            {m.type === 'split' && m.split ? (
              <div className="rounded-xl border bg-muted/50 p-3 max-w-[85%] w-full sm:max-w-xs">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-violet-500 shrink-0" />
                  <p className="text-xs font-semibold text-violet-600">Split Created</p>
                </div>
                <p className="text-sm font-semibold">{m.split.title}</p>
                <p className="text-xs text-muted-foreground">{m.split.category}</p>
                <div className="flex justify-between items-center mt-2 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Your share</span>
                  <span className="text-sm font-bold text-violet-600">{fmt(m.split.yourShare)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{m.time}</p>
              </div>
            ) : (
              <div className={`rounded-2xl px-3 py-2 max-w-[80%] ${m.from === 'me' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                <p className="text-sm">{(m as { text?: string }).text}</p>
                <p className={`text-[10px] mt-1 ${m.from === 'me' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{m.time}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="px-3 sm:px-4 py-3 border-t flex gap-2 shrink-0">
        <div className="flex-1 rounded-full bg-muted px-3 py-2 text-sm text-muted-foreground">Type a message…</div>
        <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <ArrowRight className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>
    </div>
  )
}

function AISection() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="font-semibold text-sm">AI Financial Assistant</p>
        <span className="ml-auto text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-0.5 shrink-0">Powered by Gemini</span>
      </div>
      <div className="px-3 sm:px-4 py-4 space-y-4">
        {aiChat.map((m, i) => (
          <div key={i} className={`flex gap-2 sm:gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'ai' ? 'bg-amber-100 dark:bg-amber-950' : 'bg-primary/20'}`}>
              {m.role === 'ai' ? <Bot className="w-4 h-4 text-amber-600" /> : <span className="text-xs font-bold text-primary">Y</span>}
            </div>
            <div className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'ai' ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}>
              {m.text.split('**').map((part, j) =>
                j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
              )}
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input
            readOnly
            placeholder="Ask anything about your finances…"
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground cursor-default min-w-0"
          />
          <button className="rounded-lg bg-primary px-3 py-2 shrink-0">
            <ArrowRight className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'splits', label: 'Splits', icon: Users },
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'balances', label: 'Balances', icon: Scale },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'ai', label: 'AI', icon: Bot },
] as const

type TabId = typeof TABS[number]['id']

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-base sm:text-lg shrink-0">
            <span className="text-xl sm:text-2xl">💰</span>
            <span className="hidden xs:inline">Finance Tracker</span>
          </div>
          <nav className="hidden md:flex items-center gap-5 ml-4 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#preview" className="hover:text-foreground transition-colors">Preview</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Sign In</Link>
            <Link href="/signup" className="rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm px-3 sm:px-3.5 py-1.5 font-medium hover:bg-primary/90 transition-colors whitespace-nowrap">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-12 sm:space-y-20">

        {/* Hero */}
        <section className="text-center space-y-5 sm:space-y-6 py-4 sm:py-8">
          <div className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Free · No credit card required
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15]">
            Your money,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">
              fully in control
            </span>
          </h1>
          <p className="max-w-xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
            Track expenses, split bills with friends, scan receipts, manage trips, and get AI-powered insights — all in one app built for India.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 font-semibold hover:bg-primary/90 transition-colors">
              Start for free <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#preview" className="inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 font-semibold hover:bg-muted transition-colors">
              Explore demo below
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-5 sm:gap-8 pt-2 text-sm text-muted-foreground">
            {[
              { val: '14 features', label: 'built in' },
              { val: 'Gemini AI', label: 'powered insights' },
              { val: 'Real-time', label: 'split notifications' },
              { val: 'PWA', label: 'works offline' },
            ].map(({ val, label }) => (
              <div key={val} className="text-center">
                <p className="font-semibold text-foreground">{val}</p>
                <p className="text-xs">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features grid */}
        <section id="features" className="space-y-6 sm:space-y-8">
          <div className="text-center">
            <h2 className="text-xl sm:text-3xl font-bold">Everything you need to manage money</h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">14 powerful features, zero fluff.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="rounded-xl border bg-card p-3 sm:p-4 hover:border-primary/30 transition-colors">
                <Icon className={`w-5 h-5 sm:w-6 sm:h-6 mb-2 sm:mb-3 ${color}`} />
                <p className="text-xs sm:text-sm font-semibold mb-1">{title}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Live preview */}
        <section id="preview" className="space-y-5 sm:space-y-6">
          <div className="text-center">
            <h2 className="text-xl sm:text-3xl font-bold">See it in action</h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">Interactive preview with realistic data.</p>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                  activeTab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'border hover:bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {label}
              </button>
            ))}
          </div>

          <div>
            {activeTab === 'dashboard' && <DemoSection />}
            {activeTab === 'transactions' && <TransactionsSection />}
            {activeTab === 'splits' && <SplitsSection />}
            {activeTab === 'trips' && <TripsSection />}
            {activeTab === 'balances' && <BalancesSection />}
            {activeTab === 'chat' && <ChatSection />}
            {activeTab === 'ai' && <AISection />}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border px-5 py-10 sm:px-8 sm:py-12 text-center space-y-4 sm:space-y-5">
          <h2 className="text-xl sm:text-3xl font-bold">Ready to take control?</h2>
          <p className="text-muted-foreground max-w-sm mx-auto text-sm sm:text-base">
            Join and start tracking your finances smarter. Free, private, and built for India.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 sm:px-8 py-3 font-semibold hover:bg-primary/90 transition-colors">
              Create free account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border px-6 sm:px-8 py-3 font-semibold hover:bg-muted transition-colors">
              Sign in
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">No credit card needed · Data stays private</p>
        </section>

      </main>

      <footer className="border-t mt-8">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>💰</span>
            <span className="font-semibold text-foreground">Finance Tracker</span>
            <span>— built with Next.js, Supabase &amp; Gemini</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
