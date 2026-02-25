import { InvoiceStatus } from '@/lib/types'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', classes: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', classes: 'bg-red-100 text-red-700' },
  partial: { label: 'Partial Payment', classes: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Paid', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-400' },
}

interface Props {
  status: InvoiceStatus
  size?: 'sm' | 'md'
}

export default function InvoiceStatusBadge({ status, size = 'md' }: Props) {
  const config = STATUS_CONFIG[status]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${config.classes}`}>
      {status === 'overdue' && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      )}
      {config.label}
    </span>
  )
}
