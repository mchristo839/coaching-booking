'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Invoice } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/format-utils'

interface Props {
  invoices: Invoice[]
}

export default function DueSoonBanner({ invoices }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || invoices.length === 0) return null

  const overdueCount = invoices.filter(inv => inv.status === 'overdue').length
  const dueSoonNonOverdue = invoices.filter(inv => inv.status !== 'overdue')

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount !== 1 ? 's' : ''}` : ''}
              {overdueCount > 0 && dueSoonNonOverdue.length > 0 ? ' · ' : ''}
              {dueSoonNonOverdue.length > 0 ? `${dueSoonNonOverdue.length} due soon` : ''}
            </p>
            <div className="mt-2 space-y-1">
              {invoices.slice(0, 3).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900"
                >
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span>{inv.clientName}</span>
                  <span>·</span>
                  <span>{formatCurrency(inv.amountDue, inv.currency)}</span>
                  <span>·</span>
                  <span>Due {formatDate(inv.dueDate)}</span>
                  {inv.status === 'overdue' && (
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs">Overdue</span>
                  )}
                </Link>
              ))}
              {invoices.length > 3 && (
                <p className="text-xs text-amber-600">+{invoices.length - 3} more</p>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600 p-1 flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
