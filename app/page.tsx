'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          CoachBook
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-md mx-auto">
          AI-powered WhatsApp assistant for coaching programmes. Set it up once — it answers parent questions automatically.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-16">
        <Link
          href="/auth/signup"
          className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors text-center min-h-[44px] flex items-center justify-center"
        >
          Get Started
        </Link>
        <Link
          href="/auth/login"
          className="bg-white text-blue-600 px-8 py-3 rounded-lg text-lg font-medium border-2 border-blue-600 hover:bg-blue-50 transition-colors text-center min-h-[44px] flex items-center justify-center"
        >
          Log In
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">📋</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Set Up Your Programme</h3>
          <p className="text-gray-600 text-sm">
            Fill in your programme details — venue, schedule, what to bring, pricing. Takes 2 minutes.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">💬</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Add the Bot to Your Group</h3>
          <p className="text-gray-600 text-sm">
            Add one number to your existing WhatsApp group. The bot activates instantly.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl mb-3">🤖</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Parents Get Instant Answers</h3>
          <p className="text-gray-600 text-sm">
            The AI answers questions about your programme 24/7. You stay focused on coaching.
          </p>
        </div>
      </div>
    </div>
  )
}
