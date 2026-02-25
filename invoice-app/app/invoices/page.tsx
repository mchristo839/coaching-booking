'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useInvoices, useSettings } from '@/lib/storage'
import { Invoice, InvoiceFilter, InvoiceStatus, Currency } from '@/lib/types'
import { formatCurrency, formatDate, isBeforeToday, isDueSoon } from '@/lib/format-utils'
import { deriveStatus, duplicateInvoice, generateInvoiceNumber } from '@/lib/invoice-utils'
import InvoiceStatusBadge from '@/app/components/InvoiceStatusBadge'
import StatsCard from '@/app/components/StatsCard'
import DueSoonBanner from '@/app/components/DueSoonBanner'

const STATUS_OPTIONS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'partial', label: 'Partial Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

const CURRENCY_OPTIONS: { value: Currency | 'all'; label: string }[] = [
  { value: 'all', label: 'All Currencies' },
  { value: 'AUD', label: 'AUD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'USD', label: 'USD' },
]

export default function DashboardPage() {
  const [invoices, setInvoices] = useInvoices()
  const [settings, setSettings] = useSettings()
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<InvoiceFilter>({
    search: '',
    status: 'all',
    currency: 'all',
    dateFrom: '',
    dateTo: '',
  })
  const [sortField, setSortField] = useState<'invoiceDate' | 'dueDate' | 'total' | 'clientName'>('invoiceDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-update overdue status on mount
  useEffect(() => {
    if (!mounted || invoices.length === 0) return
    let hasChanges = false
    const updated = invoices.map((inv) => {
      if (inv.status === 'sent' && isBeforeToday(inv.dueDate) && inv.amountDue > 0) {
        hasChanges = true
        return { ...inv, status: 'overdue' as InvoiceStatus, updatedAt: new Date().toISOString() }
      }
      return inv
    })
    if (hasChanges) {
      setInvoices(updated)
    }
  }, [mounted])

  const filteredAndSorted = useMemo(() => {
    let result = [...invoices]

    // Apply filters
    if (filter.search) {
      const q = filter.search.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.clientName.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.clientEmail.toLowerCase().includes(q)
      )
    }
    if (filter.status !== 'all') {
      result = result.filter((inv) => inv.status === filter.status)
    }
    if (filter.currency !== 'all') {
      result = result.filter((inv) => inv.currency === filter.currency)
    }
    if (filter.dateFrom) {
      result = result.filter((inv) => inv.invoiceDate >= filter.dateFrom)
    }
    if (filter.dateTo) {
      result = result.filter((inv) => inv.invoiceDate <= filter.dateTo)
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = a[sortField]
      let bVal: string | number = b[sortField]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [invoices, filter, sortField, sortDir])

  // Stats calculations (all invoices, not filtered)
  const stats = useMemo(() => {
    const outstanding = invoices.filter(
      (inv) => (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partial') && inv.amountDue > 0
    )
    const overdue = invoices.filter((inv) => inv.status === 'overdue')

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const paidThisMonth = invoices.filter(
      (inv) => inv.status === 'paid' && inv.paidAt && inv.paidAt >= startOfMonth
    )

    const dueSoonList = invoices.filter(
      (inv) =>
        (inv.status === 'sent' || inv.status === 'partial') &&
        isDueSoon(inv.dueDate, 7) &&
        inv.amountDue > 0
    )

    // For outstanding, group by AUD-equivalent isn't practical; show count + AUD total if possible
    const totalOutstanding = outstanding.filter((inv) => inv.currency === 'AUD').reduce((sum, inv) => sum + inv.amountDue, 0)
    const totalPaid = paidThisMonth.filter((inv) => inv.currency === 'AUD').reduce((sum, inv) => sum + inv.total, 0)

    return {
      outstandingCount: outstanding.length,
      totalOutstanding,
      overdueCount: overdue.length,
      paidThisMonth: paidThisMonth.length,
      totalPaidThisMonth: totalPaid,
      dueSoonCount: dueSoonList.length,
      dueSoonInvoices: [...overdue, ...dueSoonList].slice(0, 5),
    }
  }, [invoices])

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  function handleDuplicate(invoice: Invoice) {
    const newNumber = generateInvoiceNumber(settings)
    const newInvoice = duplicateInvoice(invoice, newNumber)
    setSettings({ ...settings, nextInvoiceNumber: settings.nextInvoiceNumber + 1 })
    setInvoices([...invoices, newInvoice])
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    setInvoices(invoices.filter((inv) => inv.id !== id))
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-indigo-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (!mounted) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-40" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-0.5">{invoices.length} total invoices</p>
        </div>
        <Link
          href="/invoices/new"
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm min-h-[44px] flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Invoice
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatsCard
          label="Outstanding"
          value={String(stats.outstandingCount)}
          subLabel={stats.totalOutstanding > 0 ? `AUD ${formatCurrency(stats.totalOutstanding, 'AUD')}` : undefined}
          colour={stats.outstandingCount > 0 ? 'blue' : 'default'}
        />
        <StatsCard
          label="Overdue"
          value={String(stats.overdueCount)}
          colour={stats.overdueCount > 0 ? 'red' : 'default'}
        />
        <StatsCard
          label="Paid This Month"
          value={String(stats.paidThisMonth)}
          subLabel={stats.totalPaidThisMonth > 0 ? formatCurrency(stats.totalPaidThisMonth, 'AUD') : undefined}
          colour={stats.paidThisMonth > 0 ? 'green' : 'default'}
        />
        <StatsCard
          label="Due Soon (7 days)"
          value={String(stats.dueSoonCount)}
          colour={stats.dueSoonCount > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Due soon / overdue banner */}
      <DueSoonBanner invoices={stats.dueSoonInvoices} />

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              placeholder="Search by client name, invoice #, or email..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value as InvoiceStatus | 'all' })}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={filter.currency}
            onChange={(e) => setFilter({ ...filter, currency: e.target.value as Currency | 'all' })}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">–</span>
            <input
              type="date"
              value={filter.dateTo}
              onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="To"
            />
          </div>
          {(filter.search || filter.status !== 'all' || filter.currency !== 'all' || filter.dateFrom || filter.dateTo) && (
            <button
              onClick={() => setFilter({ search: '', status: 'all', currency: 'all', dateFrom: '', dateTo: '' })}
              className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Invoices table */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No invoices yet</h2>
          <p className="text-gray-500 text-sm mb-6">Create your first invoice to get started.</p>
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </Link>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm mb-3">No invoices match your filters.</p>
          <button
            onClick={() => setFilter({ search: '', status: 'all', currency: 'all', dateFrom: '', dateTo: '' })}
            className="text-indigo-600 text-sm hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort('invoiceDate')}
                  >
                    Invoice # / Date <SortIcon field="invoiceDate" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort('clientName')}
                  >
                    Client <SortIcon field="clientName" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-700 hidden md:table-cell"
                    onClick={() => toggleSort('dueDate')}
                  >
                    Due Date <SortIcon field="dueDate" />
                  </th>
                  <th
                    className="text-right text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort('total')}
                  >
                    Amount <SortIcon field="total" />
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((invoice) => {
                  const overdue = invoice.status === 'overdue'
                  const dueSoon =
                    (invoice.status === 'sent' || invoice.status === 'partial') &&
                    isDueSoon(invoice.dueDate, 7)
                  let rowBg = 'hover:bg-gray-50'
                  if (overdue) rowBg = 'bg-red-50 hover:bg-red-100'
                  else if (dueSoon) rowBg = 'bg-amber-50 hover:bg-amber-100'

                  return (
                    <tr key={invoice.id} className={`border-b border-gray-100 transition-colors ${rowBg}`}>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${invoice.id}`} className="block">
                          <p className="text-sm font-semibold text-gray-900 font-mono hover:text-indigo-700">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="text-xs text-gray-400">{formatDate(invoice.invoiceDate)}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${invoice.id}`} className="block">
                          <p className="text-sm text-gray-900">{invoice.clientName}</p>
                          {invoice.clientEmail && (
                            <p className="text-xs text-gray-400">{invoice.clientEmail}</p>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {formatDate(invoice.dueDate)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(invoice.total, invoice.currency)}
                        </p>
                        {invoice.amountDue > 0 && invoice.amountDue < invoice.total && (
                          <p className="text-xs text-amber-600">
                            {formatCurrency(invoice.amountDue, invoice.currency)} due
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={invoice.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="px-2.5 py-1.5 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded font-medium transition-colors min-h-[32px] flex items-center"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleDuplicate(invoice)}
                            className="px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors min-h-[32px]"
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded font-medium transition-colors min-h-[32px]"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">
              Showing {filteredAndSorted.length} of {invoices.length} invoices
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
