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

export interface TripBudget {
  id: string
  trip_id: string
  category: string
  amount: number
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
  created_at: string
  trip_budgets?: TripBudget[]
  total_spent?: number
  transaction_count?: number
}
