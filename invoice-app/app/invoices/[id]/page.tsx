'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { useInvoices, useSettings } from '@/lib/storage'
import { Invoice, LineItem, Currency, PaymentTerms, DiscountType, InvoiceStatus, Payment } from '@/lib/types'
import {
  calculateInvoiceTotals,
  createNewLineItem,
  calculateDueDate,
  duplicateInvoice,
  generateInvoiceNumber,
  buildInvoiceWithTotals,
  deriveStatus,
} from '@/lib/invoice-utils'
import { formatCurrency, formatDate, isBeforeToday } from '@/lib/format-utils'
import InvoiceStatusBadge from '@/app/components/InvoiceStatusBadge'
import LineItemRow from '@/app/components/LineItemRow'
import InvoiceTotalsBlock from '@/app/components/InvoiceTotalsBlock'
import AddPaymentModal from '@/app/components/AddPaymentModal'

const CURRENCIES: Currency[] = ['AUD', 'EUR', 'GBP', 'USD']
const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'partial', label: 'Partial Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [invoices, setInvoices] = useInvoices()
  const [settings, setSettings] = useSettings()
  const [mounted, setMounted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [draft, setDraft] = useState<Invoice | null>(null)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const invoice = useMemo(() => invoices.find((inv) => inv.id === id) ?? null, [invoices, id])

  // When entering edit mode, clone the invoice
  function startEditing() {
    if (!invoice) return
    setDraft({ ...invoice })
    setIsEditing(true)
    setSaveError('')
  }

  function cancelEditing() {
    setDraft(null)
    setIsEditing(false)
    setSaveError('')
  }

  // Active invoice data (draft while editing, saved otherwise)
  const active = isEditing ? draft : invoice

  const totals = useMemo(() => {
    if (!active) return null
    return calculateInvoiceTotals(
      active.lineItems,
      active.discountType,
      active.discountValue,
      active.taxRate,
      active.taxEnabled
    )
  }, [active])

  function updateDraft(updates: Partial<Invoice>) {
    if (!draft) return
    setDraft({ ...draft, ...updates })
  }

  function updateLineItem(index: number, updated: LineItem) {
    if (!draft) return
    const next = [...draft.lineItems]
    next[index] = updated
    updateDraft({ lineItems: next })
  }

  function removeLineItem(index: number) {
    if (!draft) return
    updateDraft({ lineItems: draft.lineItems.filter((_, i) => i !== index) })
  }

  function addLineItem() {
    if (!draft) return
    updateDraft({ lineItems: [...draft.lineItems, createNewLineItem()] })
  }

  function saveEdits() {
    if (!draft || !totals) return
    if (!draft.clientName.trim()) {
      setSaveError('Client name is required.')
      return
    }
    if (draft.lineItems.some((item) => !item.description.trim())) {
      setSaveError('All line items must have a description.')
      return
    }

    const amountPaid = draft.payments.reduce((sum, p) => sum + p.amount, 0)
    const amountDue = Math.max(0, totals.total - amountPaid)
    const updatedInvoice: Invoice = {
      ...draft,
      ...totals,
      amountPaid,
      amountDue,
      updatedAt: new Date().toISOString(),
    }
    // Re-derive status after edit
    updatedInvoice.status = deriveStatus(updatedInvoice)

    setInvoices(invoices.map((inv) => (inv.id === id ? updatedInvoice : inv)))
    setDraft(null)
    setIsEditing(false)
    setSaveError('')
  }

  function addPayment(payment: Payment) {
    if (!invoice) return
    const updatedPayments = [...invoice.payments, payment]
    const amountPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    const amountDue = Math.max(0, invoice.total - amountPaid)
    let status: InvoiceStatus = invoice.status
    if (amountDue <= 0) {
      status = 'paid'
    } else if (amountPaid > 0) {
      status = 'partial'
    }
    const updated: Invoice = {
      ...invoice,
      payments: updatedPayments,
      amountPaid,
      amountDue,
      status,
      paidAt: amountDue <= 0 ? new Date().toISOString() : invoice.paidAt,
      updatedAt: new Date().toISOString(),
    }
    setInvoices(invoices.map((inv) => (inv.id === id ? updated : inv)))
    setShowPaymentModal(false)
  }

  function removePayment(paymentId: string) {
    if (!invoice) return
    const updatedPayments = invoice.payments.filter((p) => p.id !== paymentId)
    const amountPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    const amountDue = Math.max(0, invoice.total - amountPaid)
    const updated: Invoice = {
      ...invoice,
      payments: updatedPayments,
      amountPaid,
      amountDue,
      status: deriveStatus({ ...invoice, amountPaid, amountDue, payments: updatedPayments }),
      paidAt: amountDue > 0 ? null : invoice.paidAt,
      updatedAt: new Date().toISOString(),
    }
    setInvoices(invoices.map((inv) => (inv.id === id ? updated : inv)))
  }

  function changeStatus(status: InvoiceStatus) {
    if (!invoice) return
    const updated: Invoice = {
      ...invoice,
      status,
      sentAt: status === 'sent' && !invoice.sentAt ? new Date().toISOString() : invoice.sentAt,
      paidAt: status === 'paid' && !invoice.paidAt ? new Date().toISOString() : invoice.paidAt,
      updatedAt: new Date().toISOString(),
    }
    setInvoices(invoices.map((inv) => (inv.id === id ? updated : inv)))
  }

  function handleDuplicate() {
    if (!invoice) return
    const newNumber = generateInvoiceNumber(settings)
    const newInvoice = duplicateInvoice(invoice, newNumber)
    setSettings({ ...settings, nextInvoiceNumber: settings.nextInvoiceNumber + 1 })
    setInvoices([...invoices, newInvoice])
    router.push(`/invoices/${newInvoice.id}`)
  }

  function handleDelete() {
    setInvoices(invoices.filter((inv) => inv.id !== id))
    router.push('/invoices')
  }

  function openPrint() {
    window.open(`/invoices/${id}/print`, '_blank')
  }

  if (!mounted) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-6 md:p-8">
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500 mb-4">Invoice not found.</p>
          <button
            onClick={() => router.push('/invoices')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!active || !totals) return null

  const isOverdue = isBeforeToday(active.dueDate) && active.amountDue > 0

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/invoices')}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{active.invoiceNumber}</h1>
          <InvoiceStatusBadge status={active.status} />
          {isOverdue && !isEditing && (
            <span className="text-xs text-red-600 font-medium">Overdue by {Math.floor((new Date().getTime() - new Date(active.dueDate).getTime()) / 86400000)} days</span>
          )}
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={startEditing}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[36px]"
              >
                Edit
              </button>
              <button
                onClick={openPrint}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[36px] flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                PDF
              </button>
              <button
                onClick={handleDuplicate}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[36px]"
              >
                Duplicate
              </button>
              {active.amountDue > 0 && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium min-h-[36px]"
                >
                  Record Payment
                </button>
              )}
              <div className="relative">
                <select
                  value={active.status}
                  onChange={(e) => changeStatus(e.target.value as InvoiceStatus)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[36px] pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium min-h-[36px]"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cancelEditing}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[36px]"
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium min-h-[36px]"
              >
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">{saveError}</div>
      )}

      <div className="space-y-6">
        {/* Sender + Client */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Sender */}
            <div className="flex-1">
              {active.senderLogoBase64 && (
                <div className="mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={active.senderLogoBase64} alt="Logo" className="max-h-14 max-w-[140px] object-contain" />
                </div>
              )}
              {isEditing && draft ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500">Sender profile:</span>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      {(['company', 'personal'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            const profile = settings.senderProfiles[type]
                            updateDraft({
                              senderProfileType: type,
                              senderName: profile.name,
                              senderEmail: profile.email,
                              senderPhone: profile.phone,
                              senderAddress: profile.address,
                              senderAbn: profile.abn,
                              senderLogoBase64: profile.logoBase64,
                            })
                          }}
                          className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                            draft.senderProfileType === type
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">(or edit fields below)</span>
                  </div>
                  <input
                    type="text"
                    value={draft.senderName}
                    onChange={(e) => updateDraft({ senderName: e.target.value })}
                    placeholder="Sender name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={draft.senderAbn}
                    onChange={(e) => updateDraft({ senderAbn: e.target.value })}
                    placeholder="ABN / Tax number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={draft.senderEmail}
                    onChange={(e) => updateDraft({ senderEmail: e.target.value })}
                    placeholder="Email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={draft.senderPhone}
                    onChange={(e) => updateDraft({ senderPhone: e.target.value })}
                    placeholder="Phone"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    value={draft.senderAddress}
                    onChange={(e) => updateDraft({ senderAddress: e.target.value })}
                    rows={3}
                    placeholder="Address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              ) : (
                <div className="text-sm space-y-0.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">From</p>
                  {active.senderName && <p className="font-semibold text-gray-900">{active.senderName}</p>}
                  {active.senderAbn && <p className="text-gray-500">ABN: {active.senderAbn}</p>}
                  {active.senderEmail && <p className="text-gray-500">{active.senderEmail}</p>}
                  {active.senderPhone && <p className="text-gray-500">{active.senderPhone}</p>}
                  {active.senderAddress && <p className="text-gray-500 whitespace-pre-line">{active.senderAddress}</p>}
                </div>
              )}
            </div>

            {/* Client */}
            <div className="flex-1">
              {isEditing && draft ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Bill To</p>
                  <input
                    type="text"
                    value={draft.clientName}
                    onChange={(e) => updateDraft({ clientName: e.target.value })}
                    placeholder="Client name *"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="email"
                    value={draft.clientEmail}
                    onChange={(e) => updateDraft({ clientEmail: e.target.value })}
                    placeholder="Email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    value={draft.clientAddress}
                    onChange={(e) => updateDraft({ clientAddress: e.target.value })}
                    rows={3}
                    placeholder="Address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              ) : (
                <div className="text-sm space-y-0.5 md:text-right">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To</p>
                  <p className="font-semibold text-gray-900">{active.clientName}</p>
                  {active.clientEmail && <p className="text-gray-500">{active.clientEmail}</p>}
                  {active.clientAddress && <p className="text-gray-500 whitespace-pre-line">{active.clientAddress}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoice metadata */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {isEditing && draft ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={draft.invoiceNumber}
                  onChange={(e) => updateDraft({ invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={draft.invoiceDate}
                  onChange={(e) => updateDraft({ invoiceDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => updateDraft({ dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <select
                  value={draft.currency}
                  onChange={(e) => updateDraft({ currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Invoice No.</p>
                <p className="text-sm font-semibold text-gray-900 font-mono">{active.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Date</p>
                <p className="text-sm text-gray-900">{formatDate(active.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Due Date</p>
                <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatDate(active.dueDate)}
                  {isOverdue && ' (Overdue)'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Currency</p>
                <p className="text-sm text-gray-900">{active.currency}</p>
              </div>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Line Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-3">Description</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2 pr-3 w-24">Qty</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2 pr-3 w-32">Unit Price</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2 w-32">Total</th>
                  {isEditing && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {active.lineItems.map((item, index) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    currency={active.currency}
                    isEditing={isEditing}
                    onChange={(updated) => updateLineItem(index, updated)}
                    onRemove={() => removeLineItem(index)}
                    showRemove={active.lineItems.length > 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={addLineItem}
              className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium min-h-[36px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Line Item
            </button>
          )}
        </div>

        {/* Discount + Tax + Totals */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-8">
            {isEditing && draft ? (
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      {(['percentage', 'fixed'] as DiscountType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateDraft({ discountType: type })}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            draft.discountType === type
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {type === 'percentage' ? '% Percent' : '$ Fixed'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={draft.discountValue}
                      onChange={(e) => updateDraft({ discountValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                      min="0"
                      step={draft.discountType === 'percentage' ? '1' : '0.01'}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.taxEnabled}
                      onChange={(e) => updateDraft({ taxEnabled: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    Apply Tax / GST
                  </label>
                  {draft.taxEnabled && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        value={draft.taxRate}
                        onChange={(e) => updateDraft({ taxRate: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="md:w-64">
              <InvoiceTotalsBlock
                subtotal={totals.subtotal}
                discountType={active.discountType}
                discountValue={active.discountValue}
                discountAmount={totals.discountAmount}
                taxRate={active.taxRate}
                taxAmount={totals.taxAmount}
                taxEnabled={active.taxEnabled}
                total={totals.total}
                currency={active.currency}
                amountPaid={invoice.amountPaid}
                amountDue={invoice.amountDue}
                showPayments={!isEditing && invoice.amountPaid > 0}
              />
            </div>
          </div>
        </div>

        {/* Payment history */}
        {!isEditing && invoice.payments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Payment History</h2>
            <div className="space-y-2">
              {invoice.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(payment.amount, invoice.currency)}</p>
                    {payment.note && <p className="text-xs text-gray-500">{payment.note}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-500">{formatDate(payment.date)}</p>
                    <button
                      onClick={() => removePayment(payment.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      aria-label="Remove payment"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Notes</label>
              {isEditing && draft ? (
                <textarea
                  value={draft.invoiceNotes}
                  onChange={(e) => updateDraft({ invoiceNotes: e.target.value })}
                  rows={4}
                  placeholder="Thank you for your business!"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-line">
                  {active.invoiceNotes || <span className="text-gray-400 italic">No notes</span>}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Details</label>
              {isEditing && draft ? (
                <textarea
                  value={draft.paymentNotes}
                  onChange={(e) => updateDraft({ paymentNotes: e.target.value })}
                  rows={4}
                  placeholder="Bank account details..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                />
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-line font-mono">
                  {active.paymentNotes || <span className="text-gray-400 italic font-sans">No payment details</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="flex gap-3 pb-8">
            <button
              onClick={saveEdits}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm min-h-[44px]"
            >
              Save Changes
            </button>
            <button
              onClick={cancelEditing}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <AddPaymentModal
          onAdd={addPayment}
          onClose={() => setShowPaymentModal(false)}
          currency={invoice.currency}
          amountDue={invoice.amountDue}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Invoice?</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete {invoice.invoiceNumber}. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium min-h-[44px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
