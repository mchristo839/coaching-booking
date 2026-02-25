'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getInvoicesFromStorage } from '@/lib/storage'
import { Invoice } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/format-utils'

export default function PrintPage() {
  const params = useParams()
  const id = params.id as string
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const invoices = getInvoicesFromStorage()
    const found = invoices.find((inv) => inv.id === id)
    setInvoice(found ?? null)
  }, [id])

  if (!mounted) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  if (!invoice) {
    return <div className="p-8 text-gray-500">Invoice not found.</div>
  }

  const lineTotal = (q: number, u: number) => q * u

  return (
    <>
      {/* Print action bar - hidden when printing */}
      <div className="print:hidden bg-gray-800 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Invoice Preview</span>
          <span className="text-xs text-gray-400">· {invoice.invoiceNumber}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Back
          </button>
          <button
            onClick={() => window.print()}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="bg-gray-100 min-h-screen py-8 print:py-0 print:bg-white">
        <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none print:max-w-none">
          <div className="px-12 py-10 print:px-0 print:py-0">

            {/* Header */}
            <div className="flex items-start justify-between mb-10">
              {/* Logo + sender */}
              <div className="flex-1">
                {invoice.senderLogoBase64 && (
                  <div className="mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={invoice.senderLogoBase64}
                      alt="Company logo"
                      className="max-h-16 max-w-[160px] object-contain"
                    />
                  </div>
                )}
                <div className="text-sm space-y-0.5">
                  {invoice.senderName && (
                    <p className="font-bold text-gray-900 text-base">{invoice.senderName}</p>
                  )}
                  {invoice.senderAbn && <p className="text-gray-500">ABN: {invoice.senderAbn}</p>}
                  {invoice.senderEmail && <p className="text-gray-500">{invoice.senderEmail}</p>}
                  {invoice.senderPhone && <p className="text-gray-500">{invoice.senderPhone}</p>}
                  {invoice.senderAddress && (
                    <p className="text-gray-500 whitespace-pre-line">{invoice.senderAddress}</p>
                  )}
                </div>
              </div>

              {/* Invoice title + number */}
              <div className="text-right">
                <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">INVOICE</h1>
                <p className="text-lg font-semibold text-indigo-700 font-mono">{invoice.invoiceNumber}</p>
                <div className="mt-3 space-y-1 text-sm text-gray-500">
                  <div className="flex gap-6 justify-end">
                    <span className="font-medium text-gray-700">Date:</span>
                    <span>{formatDate(invoice.invoiceDate)}</span>
                  </div>
                  <div className="flex gap-6 justify-end">
                    <span className="font-medium text-gray-700">Due:</span>
                    <span>{formatDate(invoice.dueDate)}</span>
                  </div>
                  <div className="flex gap-6 justify-end">
                    <span className="font-medium text-gray-700">Currency:</span>
                    <span>{invoice.currency}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t-2 border-gray-900 mb-8" />

            {/* Bill To */}
            <div className="mb-10">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
              <div className="text-sm space-y-0.5">
                <p className="font-bold text-gray-900 text-base">{invoice.clientName}</p>
                {invoice.clientEmail && <p className="text-gray-600">{invoice.clientEmail}</p>}
                {invoice.clientAddress && (
                  <p className="text-gray-600 whitespace-pre-line">{invoice.clientAddress}</p>
                )}
              </div>
            </div>

            {/* Line items table */}
            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left text-xs font-bold text-gray-700 uppercase tracking-wide pb-3 pr-4">Description</th>
                    <th className="text-right text-xs font-bold text-gray-700 uppercase tracking-wide pb-3 pr-4 w-16">Qty</th>
                    <th className="text-right text-xs font-bold text-gray-700 uppercase tracking-wide pb-3 pr-4 w-28">Unit Price</th>
                    <th className="text-right text-xs font-bold text-gray-700 uppercase tracking-wide pb-3 w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item, i) => (
                    <tr key={item.id} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                      <td className="py-3 pr-4 text-sm text-gray-900">{item.description}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600 text-right">{item.quantity}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600 text-right">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                      <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(lineTotal(item.quantity, item.unitPrice), invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      Discount ({invoice.discountType === 'percentage' ? `${invoice.discountValue}%` : 'fixed'})
                    </span>
                    <span className="text-green-600">-{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
                  </div>
                )}
                {invoice.taxEnabled && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Tax / GST ({invoice.taxRate}%)</span>
                    <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                  </div>
                )}
                <div className="border-t-2 border-gray-900 pt-2 flex justify-between">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900 text-lg">{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                {invoice.amountPaid > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Amount Paid</span>
                      <span className="text-green-600">-{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                    </div>
                    <div className="border-t border-gray-300 pt-1 flex justify-between font-bold">
                      <span className={invoice.amountDue > 0 ? 'text-red-700' : 'text-green-700'}>
                        Amount Due
                      </span>
                      <span className={invoice.amountDue > 0 ? 'text-red-700' : 'text-green-700'}>
                        {formatCurrency(invoice.amountDue, invoice.currency)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment details */}
            {invoice.paymentNotes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Payment Details</p>
                <p className="text-sm text-gray-700 whitespace-pre-line font-mono">{invoice.paymentNotes}</p>
              </div>
            )}

            {/* Notes */}
            {invoice.invoiceNotes && (
              <div className="mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Notes</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.invoiceNotes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-200 pt-6 mt-6 text-center">
              <p className="text-xs text-gray-400">Thank you for your business</p>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
