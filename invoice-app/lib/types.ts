// --- Enumerations ---

export type Currency = 'AUD' | 'EUR' | 'GBP' | 'USD'

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'overdue'
  | 'partial'
  | 'paid'
  | 'cancelled'

export type PaymentTerms = 'net7' | 'net14' | 'net30' | 'custom'

export type DiscountType = 'percentage' | 'fixed'

export type SenderProfileType = 'company' | 'personal'

// --- Core data structures ---

export interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export interface Payment {
  id: string
  amount: number
  date: string // ISO 8601 date string YYYY-MM-DD
  note: string
}

export interface Invoice {
  id: string
  invoiceNumber: string // e.g. "INV-001"
  status: InvoiceStatus

  // Sender
  senderProfileType: SenderProfileType
  senderName: string
  senderEmail: string
  senderPhone: string
  senderAddress: string
  senderAbn: string
  senderLogoBase64: string | null

  // Client
  clientName: string
  clientEmail: string
  clientAddress: string

  // Dates
  invoiceDate: string // ISO date string YYYY-MM-DD
  dueDate: string // ISO date string YYYY-MM-DD
  paymentTerms: PaymentTerms
  customPaymentDays: number | null

  // Line items
  lineItems: LineItem[]

  // Financials
  currency: Currency
  discountType: DiscountType
  discountValue: number // percentage (0-100) or fixed amount
  taxRate: number // percentage, e.g. 10 for 10%
  taxEnabled: boolean

  // Computed totals
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number

  // Payments received
  payments: Payment[]
  amountPaid: number
  amountDue: number

  // Notes
  paymentNotes: string
  invoiceNotes: string

  // Meta
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  sentAt: string | null
  paidAt: string | null
}

// --- Settings / Profiles ---

export interface SenderProfile {
  type: SenderProfileType
  name: string
  email: string
  phone: string
  address: string
  logoBase64: string | null
  abn: string
}

export interface TaxRateConfig {
  AUD: number
  EUR: number
  GBP: number
  USD: number
}

export interface AppSettings {
  senderProfiles: {
    company: SenderProfile
    personal: SenderProfile
  }
  taxRates: TaxRateConfig
  defaultCurrency: Currency
  defaultPaymentTerms: PaymentTerms
  nextInvoiceNumber: number
  bankDetails: string
}

// --- UI-only types ---

export interface InvoiceFilter {
  search: string
  status: InvoiceStatus | 'all'
  currency: Currency | 'all'
  dateFrom: string
  dateTo: string
}

export interface InvoiceTotals {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
}

export interface InvoiceSummaryStats {
  totalOutstanding: number
  totalOverdue: number
  totalPaidThisMonth: number
  overdueCount: number
  dueSoonCount: number
  draftCount: number
}
