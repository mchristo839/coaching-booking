'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const name = localStorage.getItem('coachName')
    if (!name) { router.push('/auth/login'); return }
  }, [router])

  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSavedMsg('')

    try {
      const res = await fetch('/api/coach/whatsapp-jid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      if (res.status === 401) { router.push('/auth/login'); return }
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); return }
      setSavedMsg(`Saved. Your WhatsApp JID: ${data.whatsappJid}`)
    } catch {
      setError('Failed to save WhatsApp number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* WhatsApp Number */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Your WhatsApp Number</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter your personal WhatsApp number so the bot can recognise when you reply in a group.
          When you answer a parent's question, the bot will learn from your response automatically.
        </p>

        <form onSubmit={handleSavePhone} className="flex gap-3">
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+447458164754"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-900 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={saving || !phoneNumber.trim()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        {savedMsg && <p className="text-green-600 text-sm mt-2">{savedMsg}</p>}
      </div>

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
          <li>5. @mention the bot to ask it questions — it only responds when tagged</li>
        </ol>

        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-green-900 mb-1">Bot learning</p>
          <p className="text-sm text-green-700">
            When you answer a parent's question in the group, the bot automatically learns from your response. You can also send <code className="bg-green-100 px-1 rounded text-xs">!learn</code> to batch-learn from recent conversations.
          </p>
        </div>

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
