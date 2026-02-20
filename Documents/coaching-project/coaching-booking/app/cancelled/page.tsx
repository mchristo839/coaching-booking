'use client'

import Link from 'next/link'

export default function CancelledPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Cancelled
        </h1>
        <p className="text-gray-600 mb-6">
          Your payment was not processed. You can try again anytime.
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
