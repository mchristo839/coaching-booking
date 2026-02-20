'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function SuccessContent() {
  const searchParams = useSearchParams()
  const method = searchParams.get('method')
  const isCash = method === 'cash'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">{isCash ? '🤝' : '✅'}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Booking Confirmed!
        </h1>
        <p className="text-gray-600 mb-6">
          {isCash
            ? 'Your spot is reserved. Remember to bring cash to the session.'
            : 'Your payment was successful and your spot is reserved.'}
        </p>
        <Link
          href="/"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>}>
      <SuccessContent />
    </Suspense>
  )
}
