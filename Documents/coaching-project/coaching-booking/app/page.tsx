'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          CoachBook
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-md mx-auto">
          Schedule sessions, collect payments, and manage bookings. All in one place.
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 mb-16">
        <Link
          href="/auth/signup"
          className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors text-center min-h-[44px] flex items-center justify-center"
        >
          Coach Sign Up
        </Link>
        <Link
          href="/auth/login"
          className="bg-white text-blue-600 px-8 py-3 rounded-lg text-lg font-medium border-2 border-blue-600 hover:bg-blue-50 transition-colors text-center min-h-[44px] flex items-center justify-center"
        >
          Coach Login
        </Link>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">📅</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Schedule Sessions</h3>
          <p className="text-gray-600 text-sm">
            Create group, 1-on-1, or 1-on-2 sessions. Set age groups, skill levels, and pricing.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">💳</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Collect Payments</h3>
          <p className="text-gray-600 text-sm">
            Accept payments through Stripe. Your clients pay online before the session.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">📋</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Track Bookings</h3>
          <p className="text-gray-600 text-sm">
            See who booked, payment status, medical info, and contact details at a glance.
          </p>
        </div>
      </div>
    </div>
  )
}
