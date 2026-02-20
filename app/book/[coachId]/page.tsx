'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Session {
  id: string
  sessionName: string
  sessionType: string
  dateTime: string
  durationMinutes: number
  capacity: number
  bookedCount: number
  ageGroup: string
  skillLevel: string
  priceCents: number
  injuryNotes: string
}

export default function BookingPage() {
  const params = useParams()
  const router = useRouter()
  const coachId = params.coachId as string

  const [step, setStep] = useState(1)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [medicalInfo, setMedicalInfo] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'cash'>('stripe')

  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch(`/api/sessions/available?coachId=${coachId}`)
        const data = await res.json()
        if (res.ok) setSessions(data.sessions || [])
        else setError(data.error || 'Failed to load sessions')
      } catch {
        setError('Failed to load available sessions')
      } finally {
        setLoading(false)
      }
    }
    loadSessions()
  }, [coachId])

  function handleSelectSession(session: Session) {
    setSelectedSession(session)
    setStep(2)
  }

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!consentGiven) {
      setError('You must give consent to proceed')
      return
    }
    setError('')
    setStep(3)
  }

  async function handleConfirm() {
    if (!selectedSession) return
    setSubmitting(true)
    setError('')

    try {
      // Create the booking with payment method
      const bookingRes = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          userName,
          userEmail,
          userPhone,
          medicalInfo,
          consentGiven: true,
          paymentMethod,
        }),
      })

      const bookingData = await bookingRes.json()

      if (!bookingRes.ok) {
        setError(bookingData.error || 'Failed to create booking')
        return
      }

      // If cash: go straight to success (booking already marked completed)
      if (paymentMethod === 'cash') {
        router.push(`/success?booking_id=${bookingData.bookingId}&method=cash`)
        return
      }

      // If stripe: create checkout session and redirect
      const description = `${selectedSession.sessionName || selectedSession.sessionType} - ${selectedSession.ageGroup}`

      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: bookingData.bookingId,
          sessionId: selectedSession.id,
          email: userEmail,
          amount: selectedSession.priceCents,
          sessionDescription: description,
        }),
      })

      const checkoutData = await checkoutRes.json()

      if (!checkoutRes.ok) {
        setError(checkoutData.error || 'Failed to create payment session')
        return
      }

      if (checkoutData.url) {
        window.location.href = checkoutData.url
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function formatShortDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 text-lg">Loading available sessions...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8 md:py-12">
      <div className="max-w-lg mx-auto">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {/* STEP 1: Select Session */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Choose a Session</h1>
            <p className="text-gray-600 text-center mb-6">Select a session to book your spot</p>

            {sessions.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-gray-500 mb-4">No sessions available right now.</p>
                <Link href="/" className="text-blue-600 hover:underline">Back to home</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:ring-2 hover:ring-blue-500 transition-all"
                  >
                    <h3 className="font-semibold text-gray-900 mb-1">{session.sessionName || session.sessionType}</h3>
                    <div className="flex justify-between items-start mb-2">
                      <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded">{session.sessionType}</span>
                      <span className="text-lg font-semibold text-gray-900">{'\u00A3'}{(session.priceCents / 100).toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-gray-900">{formatShortDate(session.dateTime)}</p>
                    <p className="text-sm text-gray-600">{session.durationMinutes} min | {session.ageGroup} | {session.skillLevel}</p>
                    <p className="text-sm text-green-600 mt-1">
                      {session.capacity - session.bookedCount} spot{session.capacity - session.bookedCount !== 1 ? 's' : ''} left
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Details + Payment Method */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Your Details</h1>
            <p className="text-gray-600 text-center mb-6">Fill in your information to complete the booking</p>

            <form onSubmit={handleDetailsSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" placeholder="Your full name" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" placeholder="your@email.com" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input type="tel" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" placeholder="+44 7..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medical Information (optional)</label>
                <textarea value={medicalInfo} onChange={(e) => setMedicalInfo(e.target.value)} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" placeholder="Any injuries, conditions, or allergies we should know about" />
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'stripe' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                    <input type="radio" name="paymentMethod" value="stripe" checked={paymentMethod === 'stripe'} onChange={() => setPaymentMethod('stripe')} className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Pay Online (Card)</p>
                      <p className="text-xs text-gray-500">Secure payment via Stripe</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'cash' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                    <input type="radio" name="paymentMethod" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Pay in Cash</p>
                      <p className="text-xs text-gray-500">Pay at the session</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input type="checkbox" id="consent" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} className="mt-1 h-5 w-5" />
                <label htmlFor="consent" className="text-sm text-gray-600">
                  I consent to my data being stored for booking purposes and confirm the information provided is accurate. *
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors min-h-[44px]">Back</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px]">Next</button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: Confirm and Pay/Book */}
        {step === 3 && selectedSession && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Confirm Booking</h1>
            <p className="text-gray-600 text-center mb-6">Review your details</p>

            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="border-b border-gray-100 pb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Session</h3>
                <p className="text-gray-900 font-medium">{selectedSession.sessionName || selectedSession.sessionType}</p>
                <p className="text-sm text-gray-600">{selectedSession.sessionType} | {selectedSession.ageGroup} | {selectedSession.skillLevel}</p>
                <p className="text-sm text-gray-600">{formatDate(selectedSession.dateTime)}</p>
                <p className="text-sm text-gray-600">{selectedSession.durationMinutes} minutes</p>
              </div>

              <div className="border-b border-gray-100 pb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Your Details</h3>
                <p className="text-gray-900">{userName}</p>
                <p className="text-sm text-gray-600">{userEmail}</p>
                {userPhone && <p className="text-sm text-gray-600">{userPhone}</p>}
                {medicalInfo && <p className="text-sm text-gray-500 mt-1">Medical: {medicalInfo}</p>}
              </div>

              <div className="border-b border-gray-100 pb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Payment</h3>
                <p className="text-gray-900 font-medium">
                  {paymentMethod === 'cash' ? 'Cash (pay at session)' : 'Online (Stripe)'}
                </p>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-lg font-medium text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">{'\u00A3'}{(selectedSession.priceCents / 100).toFixed(2)}</span>
              </div>

              {paymentMethod === 'cash' && (
                <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-lg text-sm">
                  Your spot will be reserved. Pay {'\u00A3'}{(selectedSession.priceCents / 100).toFixed(2)} in cash at the session on {formatShortDate(selectedSession.dateTime)}.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors min-h-[44px]">Back</button>
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {submitting ? 'Processing...' : paymentMethod === 'cash' ? 'Confirm Booking' : 'Pay Now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
