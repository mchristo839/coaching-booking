'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { useSettings, useInvoices } from '@/lib/storage'
import { Invoice, LineItem, Currency, PaymentTerms, DiscountType, SenderProfileType } from '@/lib/types'
import {
  calculateInvoiceTotals,
  createNewLineItem,
  generateInvoiceNumber,
  calculateDueDate,
  buildInvoiceWithTotals,
} from '@/lib/invoice-utils'
import { getTodayIso, formatCurrency } from '@/lib/format-utils'
import LineItemRow from '@/app/components/LineItemRow'
import InvoiceTotalsBlock from '@/app/components/InvoiceTotalsBlock'

const CURRENCIES: Currency[] = ['AUD', 'EUR', 'GBP', 'USD']
const CURRENCY_LABELS: Record<Currency, string> = {
  AUD: 'AUD - Australian Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  USD: 'USD - US Dollar',
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [settings, setSettings] = useSettings()
  const [invoices, setInvoices] = useInvoices()
  const [mounted, setMounted] = useState(false)

  // Form state
  const [senderType, setSenderType] = useState<SenderProfileType>('company')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(getTodayIso())
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('net30')
  const [customPaymentDays, setCustomPaymentDays] = useState(30)
  const [currency, setCurrency] = useState<Currency>('AUD')
  const [taxRate, setTaxRate] = useState(10)
  const [taxEnabled, setTaxEnabled] = useState(true)
  const [discountType, setDiscountType] = useState<DiscountType>('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  const [lineItems, setLineItems] = useState<LineItem[]>([createNewLineItem()])
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize from settings once mounted
  useEffect(() => {
    if (!mounted) return
    setCurrency(settings.defaultCurrency)
    setPaymentTerms(settings.defaultPaymentTerms)
    setTaxRate(settings.taxRates[settings.defaultCurrency])
    setPaymentNotes(settings.bankDetails)
    setInvoiceNumber(generateInvoiceNumber(settings))
  }, [mounted, settings.defaultCurrency, settings.defaultPaymentTerms])

  // Update tax rate when currency changes
  useEffect(() => {
    if (mounted) {
      setTaxRate(settings.taxRates[currency])
    }
  }, [currency, mounted])

  const dueDate = useMemo(
    () => calculateDueDate(invoiceDate, paymentTerms, customPaymentDays),
    [invoiceDate, paymentTerms, customPaymentDays]
  )

  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, discountType, discountValue, taxRate, taxEnabled),
    [lineItems, discountType, discountValue, taxRate, taxEnabled]
  )

  const senderProfile = settings.senderProfiles[senderType]

  function updateLineItem(index: number, updated: LineItem) {
    const next = [...lineItems]
    next[index] = updated
    setLineItems(next)
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function addLineItem() {
    setLineItems([...lineItems, createNewLineItem()])
  }

  function validate(): boolean {
    if (!clientName.trim()) {
      setError('Client name is required.')
      return false
    }
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.')
      return false
    }
    if (lineItems.length === 0) {
      setError('Add at least one line item.')
      return false
    }
    if (lineItems.some((item) => !item.description.trim())) {
      setError('All line items must have a description.')
      return false
    }
    return true
  }

  async function handleSave(status: 'draft' | 'sent') {
    if (!validate()) return
    setSaving(true)
    setError('')

    // Check for number collision
    const existingNumbers = invoices.map((inv) => inv.invoiceNumber)
    if (existingNumbers.includes(invoiceNumber)) {
      setError(`Invoice number ${invoiceNumber} already exists. Please use a different number.`)
      setSaving(false)
      return
    }

    const partial: Omit<Invoice, 'subtotal' | 'discountAmount' | 'taxAmount' | 'total' | 'amountPaid' | 'amountDue'> = {
      id: uuidv4(),
      invoiceNumber,
      status,
      senderProfileType: senderType,
      senderName: senderProfile.name,
      senderEmail: senderProfile.email,
      senderPhone: senderProfile.phone,
      senderAddress: senderProfile.address,
      senderAbn: senderProfile.abn,
      senderLogoBase64: senderProfile.logoBase64,
      clientName,
      clientEmail,
      clientAddress,
      invoiceDate,
      dueDate,
      paymentTerms,
      customPaymentDays: paymentTerms === 'custom' ? customPaymentDays : null,
      lineItems,
      currency,
      discountType,
      discountValue,
      taxRate,
      taxEnabled,
      payments: [],
      paymentNotes,
      invoiceNotes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sentAt: status === 'sent' ? new Date().toISOString() : null,
      paidAt: null,
    }

    const invoice = buildInvoiceWithTotals(partial)

    // Increment invoice number in settings
    const currentNum = settings.nextInvoiceNumber
    setSettings({ ...settings, nextInvoiceNumber: currentNum + 1 })
    setInvoices([...invoices, invoice])

    router.push(`/invoices/${invoice.id}`)
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

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
        <p className="text-gray-500 text-sm mt-1">Create and save a professional invoice</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>
      )}

      <div className="space-y-6">
        {/* Header card: sender + client */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Sender */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">From</h2>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(['company', 'personal'] as SenderProfileType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSenderType(type)}
                      className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                        senderType === type
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {senderProfile.logoBase64 && (
                <div className="mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={senderProfile.logoBase64}
                    alt="Logo"
                    className="max-h-12 max-w-[120px] object-contain"
                  />
                </div>
              )}

              {senderProfile.name ? (
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-gray-900">{senderProfile.name}</p>
                  {senderProfile.abn && <p className="text-gray-500">ABN: {senderProfile.abn}</p>}
                  {senderProfile.email && <p className="text-gray-500">{senderProfile.email}</p>}
                  {senderProfile.phone && <p className="text-gray-500">{senderProfile.phone}</p>}
                  {senderProfile.address && (
                    <p className="text-gray-500 whitespace-pre-line">{senderProfile.address}</p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">
                  No {senderType} profile configured.{' '}
                  <a href="/settings" className="text-indigo-600 underline">
                    Set it up in Settings
                  </a>
                </div>
              )}
            </div>

            {/* Client */}
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Bill To</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client Name *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client or company name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                  <textarea
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    rows={3}
                    placeholder="Street, City, State, Country"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invoice metadata */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Invoice Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="net7">Net 7</option>
                <option value="net14">Net 14</option>
                <option value="net30">Net 30</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {paymentTerms === 'custom' ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Days Until Due</label>
                <input
                  type="number"
                  value={customPaymentDays}
                  onChange={(e) => setCustomPaymentDays(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-gray-50">
                  {dueDate}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
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
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    currency={currency}
                    isEditing={true}
                    onChange={(updated) => updateLineItem(index, updated)}
                    onRemove={() => removeLineItem(index)}
                    showRemove={lineItems.length > 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
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
        </div>

        {/* Discount + Tax + Totals */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Discount and tax controls */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                <div className="flex gap-2 items-center">
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {(['percentage', 'fixed'] as DiscountType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDiscountType(type)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          discountType === type
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
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    min="0"
                    max={discountType === 'percentage' ? 100 : undefined}
                    step={discountType === 'percentage' ? '1' : '0.01'}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500">{discountType === 'percentage' ? '%' : currency}</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  Apply Tax / GST
                </label>
                {taxEnabled && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                    />
                    <span className="text-sm text-gray-500">%</span>
                    <span className="text-xs text-gray-400">(default from Settings for {currency})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="md:w-64">
              <InvoiceTotalsBlock
                subtotal={totals.subtotal}
                discountType={discountType}
                discountValue={discountValue}
                discountAmount={totals.discountAmount}
                taxRate={taxRate}
                taxAmount={totals.taxAmount}
                taxEnabled={taxEnabled}
                total={totals.total}
                currency={currency}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Notes</label>
              <textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={4}
                placeholder="Thank you for your business!"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Details</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={4}
                placeholder="Bank account details, payment instructions..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pb-8">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save & Mark as Sent'}
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 text-gray-500 hover:text-gray-700 text-sm min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
