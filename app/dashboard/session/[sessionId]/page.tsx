'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface SessionDetail {
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

interface BookingDetail {
  id: string
  userName: string
  userEmail: string
  userPhone: string
  medicalInfo: string
  paymentMethod: string
  paymentStatus: string
  attendanceStatus: string
  createdAt: string
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [bookings, setBookings] = useState<BookingDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const coachId = localStorage.getItem('coachId')
    if (!coachId) {
      router.push('/auth/login')
      return
    }
    loadSessionDetail()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function loadSessionDetail() {
    try {
      const res = await fetch(`/api/sessions/detail?sessionId=${encodeURIComponent(sessionId)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load session')
        return
      }

      setSession(data.session)
      setBookings(data.bookings || [])
    } catch {
      setError('Failed to load session details')
    } finally {
      setLoading(false)
    }
  }

  async function updateAttendance(bookingId: string, status: string) {
    setUpdating(bookingId)
    try {
      const res = await fetch('/api/bookings/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, attendanceStatus: status }),
      })

      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => b.id === bookingId ? { ...b, attendanceStatus: status } : b)
        )
      }
    } catch {
      setError('Failed to update attendance')
    } finally {
      setUpdating(null)
    }
  }

  async function markAllAttended() {
    const updates = bookings
      .filter((b) => b.attendanceStatus !== 'attended')
      .map((b) => ({ bookingId: b.id, attendanceStatus: 'attended' }))

    if (updates.length === 0) return

    setUpdating('all')
    try {
      const res = await fetch('/api/bookings/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => ({ ...b, attendanceStatus: 'attended' }))
        )
      }
    } catch {
      setError('Failed to update attendance')
    } finally {
      setUpdating(null)
    }
  }

  function downloadCSV() {
    if (!session || bookings.length === 0) return

    const headers = ['Name', 'Email', 'Phone', 'Medical Info', 'Payment Method', 'Payment Status', 'Attendance']
    const rows = bookings.map((b) => [
      b.userName,
      b.userEmail,
      b.userPhone,
      b.medicalInfo,
      b.paymentMethod,
      b.paymentStatus,
      b.attendanceStatus,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.sessionName || 'session'}-attendees.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function statusColor(status: string) {
    switch (status) {
      case 'attended': return 'bg-green-100 text-green-700'
      case 'no_show': return 'bg-gray-100 text-gray-600'
      default: return 'bg-blue-100 text-blue-700'
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return b.userName.toLowerCase().includes(term) || b.userEmail.toLowerCase().includes(term)
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 text-lg">Loading session...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Session not found</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      {/* Back link */}
      <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Session Info Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session.sessionName}</h1>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded">{session.sessionType}</span>
              <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded">{session.ageGroup}</span>
              <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded">{session.skillLevel}</span>
              {session.recurrenceRule !== 'None' && (
                <span className="inline-block bg-purple-100 text-purple-700 text-xs font-medium px-2 py-1 rounded">{session.recurrenceRule} Series</span>
              )}
            </div>
            <p className="text-gray-700 mt-2">{formatDate(session.dateTime)}</p>
            <p className="text-sm text-gray-600">{session.durationMinutes} minutes</p>
            {session.injuryNotes && <p className="text-sm text-gray-500 mt-1">Notes: {session.injuryNotes}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{'\u00A3'}{(session.priceCents / 100).toFixed(2)}</p>
            <p className="text-sm text-gray-600">{bookings.length} / {session.capacity} attending</p>
          </div>
        </div>
      </div>

      {/* Attendee Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 flex-1 min-h-[44px]"
        />
        <button
          onClick={markAllAttended}
          disabled={updating === 'all' || bookings.length === 0}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
        >
          {updating === 'all' ? 'Updating...' : 'Mark All Attended'}
        </button>
        <button
          onClick={downloadCSV}
          disabled={bookings.length === 0}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
        >
          Download CSV
        </button>
      </div>

      {/* Attendee Table */}
      {bookings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
          No bookings for this session yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium text-gray-700 hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-700">Payment</th>
                <th className="px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 font-medium text-gray-700">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((booking) => (
                <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{booking.userName}</p>
                    <p className="text-xs text-gray-500 sm:hidden">{booking.userEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{booking.userEmail}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{booking.userPhone || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      booking.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {booking.paymentMethod === 'cash' ? 'Cash' : 'Stripe'}
                    </span>
                    <span className={`ml-1 text-xs font-medium px-2 py-0.5 rounded ${
                      booking.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {booking.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor(booking.attendanceStatus)}`}>
                      {booking.attendanceStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={booking.attendanceStatus}
                      onChange={(e) => updateAttendance(booking.id, e.target.value)}
                      disabled={updating === booking.id}
                      className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-900 min-h-[36px]"
                    >
                      <option value="registered">Registered</option>
                      <option value="attended">Attended</option>
                      <option value="no_show">No Show</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
