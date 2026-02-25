interface Props {
  label: string
  value: string
  subLabel?: string
  colour?: 'default' | 'red' | 'amber' | 'green' | 'blue'
}

const colourClasses = {
  default: 'border-gray-200',
  red: 'border-red-300 bg-red-50',
  amber: 'border-amber-300 bg-amber-50',
  green: 'border-green-300 bg-green-50',
  blue: 'border-blue-300 bg-blue-50',
}

const valueColourClasses = {
  default: 'text-gray-900',
  red: 'text-red-700',
  amber: 'text-amber-700',
  green: 'text-green-700',
  blue: 'text-blue-700',
}

export default function StatsCard({ label, value, subLabel, colour = 'default' }: Props) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${colourClasses[colour]}`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColourClasses[colour]}`}>{value}</p>
      {subLabel && <p className="text-xs text-gray-400 mt-1">{subLabel}</p>}
    </div>
  )
}
