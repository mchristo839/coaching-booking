import { Currency, DiscountType } from '@/lib/types'
import { formatCurrency } from '@/lib/format-utils'

interface Props {
  subtotal: number
  discountType: DiscountType
  discountValue: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  taxEnabled: boolean
  total: number
  currency: Currency
  amountPaid?: number
  amountDue?: number
  showPayments?: boolean
}

export default function InvoiceTotalsBlock({
  subtotal,
  discountType,
  discountValue,
  discountAmount,
  taxRate,
  taxAmount,
  taxEnabled,
  total,
  currency,
  amountPaid = 0,
  amountDue,
  showPayments = false,
}: Props) {
  const effectiveAmountDue = amountDue ?? total

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal, currency)}</span>
      </div>

      {discountAmount > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>
            Discount{' '}
            {discountType === 'percentage'
              ? `(${discountValue}%)`
              : '(fixed)'}
          </span>
          <span className="text-green-600">-{formatCurrency(discountAmount, currency)}</span>
        </div>
      )}

      {taxEnabled && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>Tax / GST ({taxRate}%)</span>
          <span>{formatCurrency(taxAmount, currency)}</span>
        </div>
      )}

      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
        <span className="text-base">Total</span>
        <span className="text-base">{formatCurrency(total, currency)}</span>
      </div>

      {showPayments && amountPaid > 0 && (
        <>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Amount Paid</span>
            <span className="text-green-600">-{formatCurrency(amountPaid, currency)}</span>
          </div>
          <div className="border-t border-gray-300 pt-2 flex justify-between font-bold">
            <span className={effectiveAmountDue > 0 ? 'text-red-700' : 'text-green-700'}>Amount Due</span>
            <span className={effectiveAmountDue > 0 ? 'text-red-700' : 'text-green-700'}>
              {formatCurrency(effectiveAmountDue, currency)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
