'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState('')
  const [copied, setCopied] = useState(false)
  const [whatsappCopied, setWhatsappCopied] = useState(false)

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
    setCoachId(id)
  }, [router])

  const bookingUrl = typeof window !== 'undefined' ? `${window.location.origin}/book/${coachId}` : ''

  function copyBookingLink() {
    navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyWhatsappShareLink() {
    const text = encodeURIComponent(`Book your coaching session here: ${bookingUrl}`)
    navigator.clipboard.writeText(`https://wa.me/?text=${text}`)
    setWhatsappCopied(true)
    setTimeout(() => setWhatsappCopied(false), 2000)
  }

  function openWhatsappShare() {
    const text = encodeURIComponent(`Book your coaching session here: ${bookingUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Booking Link */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Booking Link</h2>
        <p className="text-sm text-gray-500 mb-3">Share this link with clients so they can book sessions.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            readOnly
            value={bookingUrl}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-gray-50 text-sm"
          />
          <button onClick={copyBookingLink} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 min-h-[44px]">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        <div className="flex gap-3 mt-3">
          <button onClick={openWhatsappShare} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 min-h-[44px]">
            Share on WhatsApp
          </button>
          <button onClick={copyWhatsappShareLink} className="bg-white text-green-600 px-4 py-2 rounded-lg text-sm font-medium border border-green-600 hover:bg-green-50 min-h-[44px]">
            {whatsappCopied ? 'Copied!' : 'Copy WhatsApp URL'}
          </button>
        </div>
      </div>

      {/* WhatsApp Bot */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp Bot</h2>
        <p className="text-sm text-gray-500 mb-4">
          Your WhatsApp bot is powered by AI. It automatically answers questions in your group chats based on the programme details you configure.
        </p>

        <div className="bg-blue-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-blue-900 mb-1">Bot number</p>
          <p className="text-sm text-blue-700 font-mono">+447458164754</p>
          <p className="text-xs text-blue-600 mt-1">Add this number to your WhatsApp groups to activate the bot.</p>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 mb-2">How it works</h3>
        <ol className="text-sm text-gray-600 space-y-2 mb-4">
          <li>1. Go to <Link href="/dashboard/programs" className="text-blue-600 hover:underline">Programmes</Link> and create a programme with full details</li>
          <li>2. Add the bot number (+447458164754) to your WhatsApp group</li>
          <li>3. Paste the WhatsApp group ID into your programme settings</li>
          <li>4. The bot will start answering questions immediately using your programme details</li>
        </ol>

        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm font-medium text-green-900 mb-1">Keeping the bot up to date</p>
          <p className="text-sm text-green-700">
            Any time you edit your programme details (venue, schedule, price, etc.), the bot automatically uses the latest information. No extra steps needed.
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
