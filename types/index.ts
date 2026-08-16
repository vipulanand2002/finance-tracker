export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: 'income' | 'expense'
  category: string
  description: string | null
  date: string
  is_recurring: boolean
  receipt_url: string | null
  trip_id: string | null
  card_id: string | null
  split_id: string | null
  is_discrete: boolean
  contact_id: string | null
  created_at: string
  contacts?: { name: string; email: string | null } | null
}

export interface CardStatement {
  id: string
  card_id: string
  user_id: string
  cycle_start: string
  cycle_end: string
  imported_at: string
}

export interface Contact {
  id: string
  user_id: string
  name: string
  email: string | null
  notes: string | null
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  category: string
  amount: number
  month: number
  year: number
  created_at: string
}

export interface BudgetWithSpent extends Budget {
  spent: number
}

export interface CategoryTotal {
  category: string
  amount: number
  percentage: number
}

export interface MonthlyData {
  month: string
  income: number
  expenses: number
}

export interface Friend {
  id: string
  friend_id: string
  email: string
  created_at: string
}

export interface SplitParticipantSummary {
  id: string
  participant_name: string
  participant_email: string | null
  amount_owed: number
  is_paid: boolean
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  type: 'text' | 'split'
  split_id: string | null
  created_at: string
  split?: {
    id: string
    title: string
    total_amount: number
    category: string
    date: string
    split_participants?: SplitParticipantSummary[]
  } | null
}

export interface TripBudget {
  id: string
  trip_id: string
  category: string
  amount: number
}

export interface TripMember {
  id: string
  trip_id: string
  email: string
  name: string | null
}

export interface Trip {
  id: string
  user_id: string
  name: string
  destination: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  image_url: string | null
  budget_total: number | null
  budget_visible_to_members: boolean | null
  is_closed: boolean
  created_at: string
  trip_budgets?: TripBudget[]
  trip_members?: TripMember[]
  total_spent?: number
  transaction_count?: number
  is_owner?: boolean
}
