import { Currency } from './types'

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AUD: 'A$',
  EUR: '€',
  GBP: '£',
  USD: '$',
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  AUD: 'AUD - Australian Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  USD: 'USD - US Dollar',
}

export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const formatted = Math.abs(amount).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(3, '0')}`
}

export function getTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysToIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isBeforeToday(isoDate: string): boolean {
  if (!isoDate) return false
  const today = getTodayIso()
  return isoDate < today
}

export function isDueSoon(isoDate: string, withinDays = 7): boolean {
  if (!isoDate) return false
  const today = getTodayIso()
  const future = addDaysToIso(today, withinDays)
  return isoDate >= today && isoDate <= future
}
