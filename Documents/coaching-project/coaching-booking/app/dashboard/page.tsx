'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  recurrenceRule: string
}

interface Booking {
  id: string
  userName: string
  userEmail: string
  userPhone: string
  paymentStatus: string
  createdAt: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('Group')
  const [formDateTime, setFormDateTime] = useState('')
  const [formDuration, setFormDuration] = useState('60')
  const [formCapacity, setFormCapacity] = useState('10')
  const [formAgeGroup, setFormAgeGroup] = useState('Adult')
  const [formSkillLevel, setFormSkillLevel] = useState('Beginner')
  const [formPrice, setFormPrice] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formRecurrence, setFormRecurrence] = useState('None')
  const [formRecurrenceEnd, setFormRecurrenceEnd] = useState('')

  const fetchData = useCallback(async (id: string) => {
    try {
      const [sessionsRes, bookingsRes] = await Promise.all([
        fetch(`/api/sessions/list?coachId=${encodeURIComponent(id)}`),
        fetch(`/api/bookings/list?coachId=${encodeURIComponent(id)}`),
      ])

      const sessionsData = await sessionsRes.json()
      const bookingsData = await bookingsRes.json()

      if (sessionsRes.ok) setSessions(sessionsData.sessions || [])
      if (bookingsRes.ok) setBookings(bookingsData.bookings || [])
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    const name = localStorage.getItem('coachName')
    if (!id) {
      router.push('/auth/login')
      return
    }
    setCoachId(id)
    setCoachName(name || 'Coach')
    fetchData(id)
  }, [router, fetchData])

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    if (!coachId) return
    setCreating(true)
    setError('')
    setSuccessMsg('')

    try {
      const priceCents = Math.round(parseFloat(formPrice) * 100)

      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          sessionName: formName,
          sessionType: formType,
          dateTime: new Date(formDateTime).toISOString(),
          durationMinutes: Number(formDuration),
          capacity: Number(formCapacity),
          ageGroup: formAgeGroup,
          skillLevel: formSkillLevel,
          priceCents,
          injuryNotes: formNotes,
          recurrenceRule: formRecurrence,
          recurrenceEndDate: formRecurrenceEnd || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create session')
        return
      }

      const count = data.count || 1
      setSuccessMsg(count > 1 ? `Created ${count} recurring sessions` : 'Session created')
      setShowCreateForm(false)
      setFormName('')
      setFormPrice('')
      setFormNotes('')
      setFormDateTime('')
      setFormRecurrence('None')
      setFormRecurrenceEnd('')
      fetchData(coachId)
    } catch {
      setError('Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('coachId')
    localStorage.removeItem('coachEmail')
    localStorage.removeItem('coachName')
    router.push('/')
  }

  function copyBookingLink() {
    if (!coachId) return
    const url = `${window.location.origin}/book/${coachId}`
    navigator.clipboard.writeText(url)
    setCopied(coachId)
    setTimeout(() => setCopied(null), 2000)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 text-lg">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Welcome, {coachName}
          </h1>
          <p className="text-gray-600 text-sm mt-1">Manage your coaching sessions and bookings</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={copyBookingLink}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-medium border border-blue-600 hover:bg-blue-50 transition-colors min-h-[44px]"
          >
            {copied ? 'Copied!' : 'Copy Booking Link'}
          </button>
          <Link
            href="/dashboard/settings"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors min-h-[44px]"
          >
            Log Out
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {successMsg}
        </div>
      )}

      {/* Create Session Button */}
      <button
        onClick={() => { setShowCreateForm(!showCreateForm); setSuccessMsg('') }}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors mb-6 min-h-[44px]"
      >
        {showCreateForm ? 'Cancel' : '+ Create New Session'}
      </button>

      {/* Create Session Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">New Session</h2>
          <form onSubmit={handleCreateSession} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Session Name - full width, first field */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                placeholder="e.g. Monday Evening Football"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900">
                <option value="Group">Group</option>
                <option value="1on1">1-on-1</option>
                <option value="1on2">1-on-2</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date and Time *</label>
              <input type="datetime-local" value={formDateTime} onChange={(e) => setFormDateTime(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <select value={formDuration} onChange={(e) => setFormDuration(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900">
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
              <input type="number" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} min="1" required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age Group</label>
              <select value={formAgeGroup} onChange={(e) => setFormAgeGroup(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900">
                <option value="U8">U8</option>
                <option value="U12">U12</option>
                <option value="U16">U16</option>
                <option value="Adult">Adult</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
              <select value={formSkillLevel} onChange={(e) => setFormSkillLevel(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900">
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (GBP) *</label>
              <input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required placeholder="25.00" className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" />
            </div>

            {/* Recurrence fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurring</label>
              <select value={formRecurrence} onChange={(e) => setFormRecurrence(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900">
                <option value="None">None (one-off)</option>
                <option value="Weekly">Weekly (13 sessions)</option>
                <option value="Biweekly">Biweekly (7 sessions)</option>
                <option value="Monthly">Monthly (6 sessions)</option>
              </select>
            </div>

            {formRecurrence !== 'None' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date (optional)</label>
                <input type="date" value={formRecurrenceEnd} onChange={(e) => setFormRecurrenceEnd(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" />
                <p className="text-xs text-gray-500 mt-1">Leave blank to use the default count</p>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Injury Notes (optional)</label>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} placeholder="Any special notes..." className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900" />
            </div>

            <div className="md:col-span-2">
              <button type="submit" disabled={creating} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]">
                {creating ? 'Creating...' : formRecurrence !== 'None' ? 'Create Recurring Sessions' : 'Create Session'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sessions Column */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Sessions ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
              No sessions yet. Create your first one above.
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dashboard/session/${session.id}`}
                  className="block bg-white rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
                >
                  {/* Session name as heading */}
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    {session.sessionName || 'Unnamed Session'}
                  </h3>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2">
                      <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded">
                        {session.sessionType}
                      </span>
                      {session.recurrenceRule && session.recurrenceRule !== 'None' && (
                        <span className="inline-block bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded">
                          Series
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-semibold text-gray-900">
                      {'\u00A3'}{(session.priceCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900">{formatDate(session.dateTime)}</p>
                  <p className="text-sm text-gray-600">
                    {session.durationMinutes} min | {session.ageGroup} | {session.skillLevel}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {session.bookedCount} attending / {session.capacity} capacity
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Bookings Column */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Bookings ({bookings.length})</h2>
          {bookings.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
              No bookings yet. Share your booking link to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium text-gray-900">{booking.userName}</p>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      booking.paymentStatus === 'completed' ? 'bg-green-100 text-green-700'
                        : booking.paymentStatus === 'failed' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {booking.paymentStatus}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{booking.userEmail}</p>
                  {booking.userPhone && <p className="text-sm text-gray-500">{booking.userPhone}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
