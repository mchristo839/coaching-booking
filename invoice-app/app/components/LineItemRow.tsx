import { LineItem, Currency } from '@/lib/types'
import { formatCurrency } from '@/lib/format-utils'

interface Props {
  item: LineItem
  currency: Currency
  isEditing: boolean
  onChange: (item: LineItem) => void
  onRemove: () => void
  showRemove: boolean
}

export default function LineItemRow({ item, currency, isEditing, onChange, onRemove, showRemove }: Props) {
  const lineTotal = item.quantity * item.unitPrice

  if (isEditing) {
    return (
      <tr className="border-b border-gray-100">
        <td className="py-2 pr-3">
          <input
            type="text"
            value={item.description}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            placeholder="Item description"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </td>
        <td className="py-2 pr-3 w-24">
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => onChange({ ...item, quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
            min="0"
            step="0.5"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </td>
        <td className="py-2 pr-3 w-32">
          <input
            type="number"
            value={item.unitPrice}
            onChange={(e) => onChange({ ...item, unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
            min="0"
            step="0.01"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </td>
        <td className="py-2 pr-3 w-32 text-right text-sm font-medium text-gray-900">
          {formatCurrency(lineTotal, currency)}
        </td>
        <td className="py-2 w-10 text-center">
          {showRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-400 hover:text-red-500 transition-colors p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Remove item"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="py-3 pr-3 text-sm text-gray-900">{item.description || <span className="text-gray-400 italic">No description</span>}</td>
      <td className="py-3 pr-3 text-sm text-gray-600 text-right w-24">{item.quantity}</td>
      <td className="py-3 pr-3 text-sm text-gray-600 text-right w-32">{formatCurrency(item.unitPrice, currency)}</td>
      <td className="py-3 text-sm font-medium text-gray-900 text-right w-32">{formatCurrency(lineTotal, currency)}</td>
      <td className="py-3 w-10" />
    </tr>
  )
}
