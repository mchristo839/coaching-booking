'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
  }, [router])

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* WhatsApp Bot */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp Bot</h2>
        <p className="text-sm text-gray-500 mb-4">
          Your AI assistant answers parent questions automatically in your WhatsApp groups, based on the programme details you configure.
        </p>

        <div className="bg-blue-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-blue-900 mb-1">Bot number</p>
          <p className="text-sm text-blue-700 font-mono">+447458164754</p>
          <p className="text-xs text-blue-600 mt-1">Add this number to your WhatsApp groups to activate the bot.</p>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 mb-2">How to set up</h3>
        <ol className="text-sm text-gray-600 space-y-2 mb-4">
          <li>1. Go to <Link href="/dashboard/programs" className="text-blue-600 hover:underline">Programmes</Link> and create a programme with full details</li>
          <li>2. Add the bot number (+447458164754) to your WhatsApp group</li>
          <li>3. Send any message in the group — the bot will reply with its group ID</li>
          <li>4. Copy that ID and paste it into your programme settings</li>
          <li>5. The bot will start answering questions immediately</li>
        </ol>

        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm font-medium text-green-900 mb-1">Always up to date</p>
          <p className="text-sm text-green-700">
            Any time you edit your programme details, the bot uses the latest information instantly. No extra steps needed.
          </p>
        </div>
      </div>

      {/* Programmes shortcut */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Manage Programmes</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure your programmes, knowledgebase, and WhatsApp group links.
        </p>
        <Link
          href="/dashboard/programs"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Go to Programmes
        </Link>
      </div>
    </div>
  )
}
