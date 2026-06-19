import TransactionList from '@/components/transactions/TransactionList'

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground text-sm">Manage your income and expenses</p>
      </div>
      <TransactionList />
    </div>
  )
}
