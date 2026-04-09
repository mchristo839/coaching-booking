'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Member {
  id: string
  programme_id: string
  parent_name: string
  parent_email: string | null
  parent_whatsapp_id: string | null
  parent_phone: string | null
  child_name: string | null
  child_dob: string | null
  medical_flag: boolean
  status: string
  waitlist_position: number | null
  joined_at: string
  programme_name: string | null
}

interface Programme {
  id: string
  programName: string
}

type StatusFilter = 'all' | 'active' | 'waitlisted' | 'cancelled' | 'trial'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'trial', label: 'Trial' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status: string): { label: string; cls: string } {
  switch (status.toLowerCase()) {
    case 'active':
      return { label: 'Active', cls: 'bg-green-100 text-green-700' }
    case 'waitlisted':
      return { label: 'Waitlisted', cls: 'bg-amber-100 text-amber-700' }
    case 'cancelled':
      return { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' }
    case 'trial':
      return { label: 'Trial', cls: 'bg-blue-100 text-blue-700' }
    default:
      return { label: status, cls: 'bg-gray-100 text-gray-600' }
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function MembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)

  const [filterProgramme, setFilterProgramme] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')

  /* ---------- data fetching ---------- */

  const fetchData = useCallback(async (coachId: string) => {
    try {
      const [membersRes, progsRes] = await Promise.all([
        fetch(`/api/members?coachId=${encodeURIComponent(coachId)}`),
        fetch(`/api/programmes/list?coachId=${encodeURIComponent(coachId)}`),
      ])

      if (membersRes.ok) {
        const d = await membersRes.json()
        setMembers(d.members ?? [])
      }

      if (progsRes.ok) {
        const d = await progsRes.json()
        setProgrammes(d.programmes ?? d.programs ?? [])
      }
    } catch {
      // silently fail — page still renders with empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) {
      router.push('/auth/login')
      return
    }
    fetchData(id)
  }, [router, fetchData])

  /* ---------- filtered data ---------- */

  const filtered = members.filter((m) => {
    if (filterProgramme !== 'all' && m.programme_id !== filterProgramme) return false
    if (filterStatus !== 'all' && m.status.toLowerCase() !== filterStatus) return false
    return true
  })

  /* ---------- loading ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3D8B37] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading members...</p>
        </div>
      </div>
    )
  }

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="px-4 py-6 md:px-8 lg:px-10 max-w-6xl mx-auto">

        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#3D8B37] transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Members</h1>
            <p className="text-gray-500 text-sm mt-0.5">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={filterProgramme}
            onChange={(e) => setFilterProgramme(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37] min-h-[44px]"
          >
            <option value="all">All Programmes</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.programName}
              </option>
            ))}
          </select>

          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  filterStatus === opt.value
                    ? 'bg-[#3D8B37] text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-[#3D8B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-2">No members yet</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Members will appear here as parents sign up through your WhatsApp bot.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Parent</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Child</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Programme</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Joined</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((m) => {
                      const badge = statusBadge(m.status)
                      return (
                        <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{m.parent_name}</span>
                              {m.medical_flag && (
                                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Medical flag" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.child_name || '\u2014'}</td>
                          <td className="px-4 py-3 text-gray-600">{m.programme_name || '\u2014'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(m.joined_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {m.parent_email && (
                                <a href={`mailto:${m.parent_email}`} className="text-[#3D8B37] hover:underline text-xs">
                                  {m.parent_email}
                                </a>
                              )}
                              {m.parent_phone && (
                                <span className="text-gray-500 text-xs">{m.parent_phone}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {filtered.map((m) => {
                const badge = statusBadge(m.status)
                return (
                  <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{m.parent_name}</span>
                        {m.medical_flag && (
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Medical flag" />
                        )}
                      </div>
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    {m.child_name && (
                      <p className="text-sm text-gray-600 mb-1">Child: {m.child_name}</p>
                    )}

                    {m.programme_name && (
                      <p className="text-xs text-gray-500 mb-2">{m.programme_name}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-50">
                      <span>Joined {formatDate(m.joined_at)}</span>
                      {m.parent_email && (
                        <a href={`mailto:${m.parent_email}`} className="text-[#3D8B37] hover:underline">
                          {m.parent_email}
                        </a>
                      )}
                      {m.parent_phone && <span>{m.parent_phone}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
