import { v4 as uuidv4 } from 'uuid'
import {
  Invoice,
  InvoiceTotals,
  LineItem,
  PaymentTerms,
  InvoiceStatus,
  AppSettings,
} from './types'
import {
  getTodayIso,
  addDaysToIso,
  formatInvoiceNumber,
  isBeforeToday,
} from './format-utils'

export function getPaymentTermsDays(terms: PaymentTerms, customDays: number | null): number {
  switch (terms) {
    case 'net7': return 7
    case 'net14': return 14
    case 'net30': return 30
    case 'custom': return customDays ?? 30
    default: return 30
  }
}

export function calculateDueDate(
  invoiceDate: string,
  terms: PaymentTerms,
  customDays: number | null
): string {
  const days = getPaymentTermsDays(terms, customDays)
  return addDaysToIso(invoiceDate, days)
}

export function calculateLineTotals(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

export function calculateInvoiceTotals(
  lineItems: LineItem[],
  discountType: 'percentage' | 'fixed',
  discountValue: number,
  taxRate: number,
  taxEnabled: boolean
): InvoiceTotals {
  const subtotal = calculateLineTotals(lineItems)

  let discountAmount = 0
  if (discountValue > 0) {
    if (discountType === 'percentage') {
      discountAmount = subtotal * (discountValue / 100)
    } else {
      discountAmount = Math.min(discountValue, subtotal)
    }
  }

  const taxableAmount = subtotal - discountAmount
  const taxAmount = taxEnabled ? taxableAmount * (taxRate / 100) : 0
  const total = taxableAmount + taxAmount

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total: Math.max(0, total),
  }
}

export function deriveStatus(invoice: Invoice): InvoiceStatus {
  // Don't auto-change draft or cancelled
  if (invoice.status === 'draft' || invoice.status === 'cancelled') {
    return invoice.status
  }

  if (invoice.amountDue <= 0) {
    return 'paid'
  }

  if (invoice.amountPaid > 0 && invoice.amountDue > 0) {
    return 'partial'
  }

  if (isBeforeToday(invoice.dueDate) && invoice.amountDue > 0) {
    return 'overdue'
  }

  return invoice.status
}

export function generateInvoiceNumber(settings: AppSettings): string {
  return formatInvoiceNumber(settings.nextInvoiceNumber)
}

export function createNewLineItem(): LineItem {
  return {
    id: uuidv4(),
    description: '',
    quantity: 1,
    unitPrice: 0,
  }
}

export function duplicateInvoice(source: Invoice, newNumber: string): Invoice {
  const today = getTodayIso()
  const dueDate = calculateDueDate(today, source.paymentTerms, source.customPaymentDays)

  return {
    ...source,
    id: uuidv4(),
    invoiceNumber: newNumber,
    status: 'draft',
    invoiceDate: today,
    dueDate,
    payments: [],
    amountPaid: 0,
    amountDue: source.total,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sentAt: null,
    paidAt: null,
    lineItems: source.lineItems.map((item) => ({ ...item, id: uuidv4() })),
  }
}

export function buildInvoiceWithTotals(
  partial: Omit<Invoice, 'subtotal' | 'discountAmount' | 'taxAmount' | 'total' | 'amountPaid' | 'amountDue'>
): Invoice {
  const totals = calculateInvoiceTotals(
    partial.lineItems,
    partial.discountType,
    partial.discountValue,
    partial.taxRate,
    partial.taxEnabled
  )
  const amountPaid = partial.payments.reduce((sum, p) => sum + p.amount, 0)

  return {
    ...partial,
    ...totals,
    amountPaid,
    amountDue: Math.max(0, totals.total - amountPaid),
  }
}
