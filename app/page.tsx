'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-4 pt-20 pb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 text-center">
          MyCoachingAssistant
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-xl mx-auto text-center mb-10">
          Your AI-powered coaching assistant. Handles enquiries, collects payments, tracks attendance — so you can focus on coaching.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Link
            href="/register"
            className="bg-[#3D8B37] text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-[#346F2F] transition-colors text-center min-h-[44px] flex items-center justify-center"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="bg-white text-[#3D8B37] px-8 py-3 rounded-lg text-lg font-medium border-2 border-[#3D8B37] hover:bg-green-50 transition-colors text-center min-h-[44px] flex items-center justify-center"
          >
            Log In
          </Link>
        </div>

        <p className="text-sm text-gray-500">Built for grassroots coaches across the UK</p>
      </div>

      {/* Features */}
      <div className="px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Answers every question</h3>
            <p className="text-gray-600 text-sm">
              Parents get instant answers about times, prices, locations and more. 24/7, via WhatsApp.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Learns from you</h3>
            <p className="text-gray-600 text-sm">
              The bot watches how you communicate, then matches your style. It gets smarter every week.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Gives you back your time</h3>
            <p className="text-gray-600 text-sm">
              No more answering the same WhatsApp messages. No more chasing payments. No more admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
