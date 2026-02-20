'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState('')
  const [coachName, setCoachName] = useState('')
  const [copied, setCopied] = useState(false)
  const [whatsappCopied, setWhatsappCopied] = useState(false)

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    const name = localStorage.getItem('coachName')
    if (!id) {
      router.push('/auth/login')
      return
    }
    setCoachId(id)
    setCoachName(name || 'Coach')
  }, [router])

  const bookingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/book/${coachId}`
    : ''

  function copyBookingLink() {
    navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyWhatsappShareLink() {
    const text = encodeURIComponent(`Book your coaching session here: ${bookingUrl}`)
    const whatsappUrl = `https://wa.me/?text=${text}`
    navigator.clipboard.writeText(whatsappUrl)
    setWhatsappCopied(true)
    setTimeout(() => setWhatsappCopied(false), 2000)
  }

  function openWhatsappShare() {
    const text = encodeURIComponent(`Book your coaching session here: ${bookingUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const faqResponses = [
    { question: 'How do I book a session?', answer: 'Click the booking link, select a session, enter your details, and confirm. Pay online via Stripe or cash at the session.' },
    { question: 'What sessions are available?', answer: 'Available sessions change weekly. Click your booking link to see all open sessions with dates and times.' },
    { question: 'Can I cancel my booking?', answer: 'Reply with your name and booking details. The coach will process your cancellation.' },
    { question: "What's the price?", answer: 'Session prices vary. Check your booking link to see prices for each session type.' },
    { question: 'What do I need to bring?', answer: 'Most sessions require sports shoes, water, and weather-appropriate clothes. Check your session details for specifics.' },
    { question: 'When does the session start?', answer: 'Session times are in your booking confirmation. Reply with your name and we will send the time.' },
  ]

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Booking Link Section */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Booking Link</h2>
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
      </div>

      {/* WhatsApp Integration Section */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">WhatsApp Integration</h2>
        <p className="text-sm text-gray-600 mb-4">
          Share your booking link on WhatsApp, or set up a WhatsApp FAQ bot using Brevo and n8n to answer common questions automatically.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button onClick={openWhatsappShare} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 min-h-[44px]">
            Share Booking Link on WhatsApp
          </button>
          <button onClick={copyWhatsappShareLink} className="bg-white text-green-600 px-4 py-2 rounded-lg text-sm font-medium border border-green-600 hover:bg-green-50 min-h-[44px]">
            {whatsappCopied ? 'Copied!' : 'Copy WhatsApp Share URL'}
          </button>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">WhatsApp Bot Setup (Brevo + n8n)</h3>
          <ol className="text-sm text-gray-600 space-y-2">
            <li>1. Sign up at <a href="https://www.brevo.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">brevo.com</a> and enable WhatsApp Business API</li>
            <li>2. Verify your WhatsApp Business phone number (1-2 days approval)</li>
            <li>3. Import the n8n workflow JSON (included in your project files)</li>
            <li>4. Add your Brevo API credentials to the n8n workflow</li>
            <li>5. Set the webhook URL in Brevo to point to your n8n trigger</li>
            <li>6. Test by sending a message to your WhatsApp Business number</li>
          </ol>
        </div>
      </div>

      {/* FAQ Bot Responses */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">WhatsApp FAQ Responses</h2>
        <p className="text-sm text-gray-600 mb-4">
          These are the automated responses your WhatsApp bot will send. Edit them in your n8n workflow.
        </p>
        <div className="space-y-4">
          {faqResponses.map((faq, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-900 mb-1">Q: {faq.question}</p>
              <p className="text-sm text-gray-600">A: {faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
