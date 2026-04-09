'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [tradingName, setTradingName] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }

    setName(localStorage.getItem('coachName') || '')
    setEmail(localStorage.getItem('coachEmail') || '')
    setMobile(localStorage.getItem('coachMobile') || '')
    setTradingName(localStorage.getItem('tradingName') || '')
  }, [router])

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-[#3D8B37] hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Bot Setup */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Bot Setup</h2>
        <p className="text-sm text-gray-500 mb-4">
          Connect your WhatsApp group to activate the bot.
        </p>

        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-gray-900 mb-1">Bot number</p>
          <p className="text-sm text-[#3D8B37] font-mono font-medium">+447458164754</p>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 mb-3">How to set up</h3>
        <ol className="text-sm text-gray-600 space-y-3 mb-4">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3D8B37] text-white text-xs flex items-center justify-center font-medium">1</span>
            <span>Add the bot number (+447458164754) to your WhatsApp group</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3D8B37] text-white text-xs flex items-center justify-center font-medium">2</span>
            <span>Send any message in the group</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3D8B37] text-white text-xs flex items-center justify-center font-medium">3</span>
            <span>The bot will reply with the group ID</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3D8B37] text-white text-xs flex items-center justify-center font-medium">4</span>
            <span>Go to <Link href="/dashboard/programs" className="text-[#3D8B37] hover:underline">Programmes</Link> and paste the group ID</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3D8B37] text-white text-xs flex items-center justify-center font-medium">5</span>
            <span>The bot is now live</span>
          </li>
        </ol>

        <Link
          href="/dashboard/programs"
          className="inline-block bg-[#3D8B37] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#346F2F] transition-colors"
        >
          Go to Programmes
        </Link>
      </div>

      {/* Account */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Account</h2>
        <p className="text-sm text-gray-500 mb-4">These details were set during registration.</p>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
            <p className="text-sm text-gray-900">{name || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
            <p className="text-sm text-gray-900">{email || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mobile</p>
            <p className="text-sm text-gray-900">{mobile || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trading Name</p>
            <p className="text-sm text-gray-900">{tradingName || '-'}</p>
          </div>
        </div>
      </div>

      {/* Bot Behaviour */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Bot Behaviour</h2>
        <p className="text-sm text-gray-500 mb-4">
          When the bot first joins your group, it enters observation mode. It watches how you communicate and learns your style before going live.
        </p>

        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700">
            Your bot learns from your conversations and gets smarter over time. The longer it observes, the better it matches your tone and approach.
          </p>
        </div>

        <Link
          href="/dashboard/learning"
          className="text-[#3D8B37] text-sm font-medium hover:underline"
        >
          View Learning Log &rarr;
        </Link>
      </div>
    </div>
  )
}
