'use client'

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Payment, Currency } from '@/lib/types'
import { formatCurrency, getTodayIso } from '@/lib/format-utils'

interface Props {
  onAdd: (payment: Payment) => void
  onClose: () => void
  currency: Currency
  amountDue: number
}

export default function AddPaymentModal({ onAdd, onClose, currency, amountDue }: Props) {
  const [amount, setAmount] = useState(amountDue > 0 ? String(amountDue.toFixed(2)) : '')
  const [date, setDate] = useState(getTodayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Please enter a valid amount.')
      return
    }
    if (parsedAmount > amountDue + 0.001) {
      setError(`Amount cannot exceed ${formatCurrency(amountDue, currency)} (amount due).`)
      return
    }
    if (!date) {
      setError('Please select a payment date.')
      return
    }
    onAdd({
      id: uuidv4(),
      amount: parsedAmount,
      date,
      note,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <div className="text-sm text-gray-500 mb-2">
            Amount due: <span className="font-semibold text-gray-900">{formatCurrency(amountDue, currency)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount Received
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError('') }}
                min="0.01"
                step="0.01"
                max={amountDue}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bank transfer, ref #12345"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium min-h-[44px]"
            >
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
