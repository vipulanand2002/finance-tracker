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
