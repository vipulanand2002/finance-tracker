'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Upload, Loader2, CheckSquare, Square } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ParsedTransaction {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  selected: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  preloadedTransactions?: Omit<ParsedTransaction, 'selected'>[]
  preloadedFilename?: string
}

export default function PDFImport({ open, onClose, onImported, preloadedTransactions, preloadedFilename }: Props) {
  const initialStep = preloadedTransactions ? 'preview' : 'upload'
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>(initialStep)
  const [transactions, setTransactions] = useState<ParsedTransaction[]>(
    preloadedTransactions ? preloadedTransactions.map(t => ({ ...t, selected: true })) : []
  )
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync when preloaded data arrives after open
  const prevPreloaded = useRef(preloadedTransactions)
  if (preloadedTransactions && preloadedTransactions !== prevPreloaded.current) {
    prevPreloaded.current = preloadedTransactions
    setStep('preview')
    setTransactions(preloadedTransactions.map(t => ({ ...t, selected: true })))
  }

  function reset() {
    setStep(preloadedTransactions ? 'preview' : 'upload')
    setTransactions(preloadedTransactions ? preloadedTransactions.map(t => ({ ...t, selected: true })) : [])
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Please select a PDF file'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('File too large. Max 20MB.'); return }

    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const res = await fetch('/api/pdf', { method: 'POST', body: fd })

      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error('Server error — the PDF may be too large or took too long to process. Try a smaller statement.')
      }

      if (data.error) throw new Error(data.error)
      if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
        toast.error('No transactions found in this PDF')
        return
      }

      setTransactions(data.transactions.map((t: Omit<ParsedTransaction, 'selected'>) => ({ ...t, selected: true })))
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse PDF')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function toggleSelect(i: number) {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, selected: !t.selected } : t))
  }

  function toggleAll() {
    const allSelected = transactions.every(t => t.selected)
    setTransactions(prev => prev.map(t => ({ ...t, selected: !allSelected })))
  }

  async function handleImport() {
    const selected = transactions.filter(t => t.selected)
    if (selected.length === 0) { toast.error('Select at least one transaction'); return }

    setStep('importing')
    let imported = 0
    let failed = 0

    for (const t of selected) {
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: t.amount,
            type: t.type,
            category: t.category,
            description: t.description,
            date: t.date,
            is_recurring: false,
            receipt_url: null,
          }),
        })
        if (res.ok) imported++; else failed++
      } catch { failed++ }
    }

    if (imported > 0) {
      toast.success(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`)
      onImported()
      reset()
      onClose()
    } else {
      toast.error('Import failed. Please try again.')
      setStep('preview')
    }
  }

  const selectedCount = transactions.filter(t => t.selected).length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {preloadedFilename ? `Import: ${preloadedFilename}` : 'Import Bank Statement PDF'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-4">
            {parsing ? (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">AI is reading your statement…</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Upload your bank statement</p>
                  <p className="text-sm text-muted-foreground mt-1">PDF format · Max 20MB · AI will extract all transactions</p>
                  <p className="text-xs text-muted-foreground mt-1">Works with HDFC, ICICI, SBI, Axis, Kotak and most Indian banks</p>
                </div>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" /> Select PDF
                </Button>
              </>
            )}
          </div>
        )}

        {(step === 'preview' || step === 'importing') && (
          <>
            <div className="flex items-center justify-between py-2 px-1 border-b">
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                {transactions.every(t => t.selected) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {selectedCount} of {transactions.length} selected
              </button>
              <Button variant="ghost" size="sm" onClick={reset}>Choose different file</Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {step === 'importing' ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Importing transactions…</p>
                </div>
              ) : (
                <div className="divide-y">
                  {transactions.map((t, i) => (
                    <label key={i} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={() => toggleSelect(i)}
                        className="w-4 h-4 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.date ? format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy') : '—'} · {t.category}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                        </span>
                        <Badge variant={t.type === 'income' ? 'secondary' : 'outline'} className="text-xs hidden sm:inline-flex">
                          {t.type}
                        </Badge>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
              <Button onClick={handleImport} disabled={selectedCount === 0 || step === 'importing'}>
                Import {selectedCount} transaction{selectedCount !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
