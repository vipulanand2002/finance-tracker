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
