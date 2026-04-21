'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Programme {
  id: string
  programName: string
  programmeName?: string
  whatsappGroupId: string | null
  isActive: boolean
  createdAt: string
  currentMembers?: number
  maxCapacity?: number
  memberCount?: number
  waitlistCount?: number
  programmeStatus?: string
  skillLevel?: string
  targetAudience?: string
  venueName?: string
  sessionDays?: string[]
  sessionStartTime?: string
}

interface TopCategory {
  category: string
  count: number
}

interface DashboardStats {
  activeMembers: number
  activeProgrammes: number
  revenueThisMonth: number
  outstanding: number
  botInteractionsWeek: number
  escalatedWeek: number
  pendingFaqs: number
  payments: {
    revenueThisMonth: number
    outstanding: number
    overdueCount: number
  }
  conversations: {
    total: number
    botHandled: number
    escalated: number
  }
  topCategories: TopCategory[]
}

const CATEGORY_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function capacityPercent(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.round((current / max) * 100), 100)
}

function capacityColor(percent: number): string {
  if (percent >= 95) return 'bg-red-500'
  if (percent >= 80) return 'bg-amber-500'
  return 'bg-[#3D8B37]'
}

function statusBadge(programme: Programme): { label: string; cls: string } {
  const pct = capacityPercent(programme.memberCount ?? programme.currentMembers ?? 0, programme.maxCapacity ?? 0)
  if (programme.programmeStatus) {
    const s = programme.programmeStatus.toLowerCase()
    if (s === 'full') return { label: 'Full', cls: 'bg-red-100 text-red-700' }
    if (s === 'almost full') return { label: 'Almost Full', cls: 'bg-amber-100 text-amber-700' }
    if (s === 'open') return { label: 'Open', cls: 'bg-green-100 text-green-700' }
    return { label: programme.programmeStatus || 'Open', cls: 'bg-gray-100 text-gray-700' }
  }
  if (pct >= 95) return { label: 'Full', cls: 'bg-red-100 text-red-700' }
  if (pct >= 80) return { label: 'Almost Full', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Open', cls: 'bg-green-100 text-green-700' }
}

/* ------------------------------------------------------------------ */
/*  Sidebar / Nav                                                      */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string
  href: string
  active?: boolean
  requiresAuthority?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  { label: 'Control Centre', href: '/dashboard/control-centre', requiresAuthority: true },
  { label: 'Programmes', href: '/dashboard/programmes' },
  { label: 'Members', href: '/dashboard/members' },
  { label: 'Referrals', href: '/dashboard/referrals', requiresAuthority: true },
  { label: 'Learning Log', href: '/dashboard/learning' },
  { label: 'Settings', href: '/dashboard/settings' },
]

function visibleNavItems(hasAuthority: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requiresAuthority || hasAuthority)
}

function Sidebar({ onLogout, hasAuthority }: { onLogout: () => void; hasAuthority: boolean }) {
  const items = visibleNavItems(hasAuthority)
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen bg-white border-r border-gray-200 py-6 px-4 fixed left-0 top-0">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#3D8B37]">MyCoachingAssistant</p>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              item.active
                ? 'bg-[#3D8B37]/10 text-[#3D8B37]'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        onClick={onLogout}
        className="mt-auto px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
      >
        Log Out
      </button>
    </aside>
  )
}

function MobileNav({ onLogout, hasAuthority }: { onLogout: () => void; hasAuthority: boolean }) {
  const [open, setOpen] = useState(false)
  const items = visibleNavItems(hasAuthority)

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#3D8B37]">MyCoachingAssistant</p>
        <button
          onClick={() => setOpen(!open)}
          className="text-gray-600 p-2 rounded-lg hover:bg-gray-100"
          aria-label="Toggle navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <nav className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? 'bg-[#3D8B37]/10 text-[#3D8B37]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => { setOpen(false); onLogout() }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
          >
            Log Out
          </button>
        </nav>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter()
  const [coachName, setCoachName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hasAuthority, setHasAuthority] = useState(false)

  /* ---------- handlers ---------- */

  function copyBookingLink(progId: string) {
    const url = `${window.location.origin}/join/${progId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(progId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  /* ---------- data fetching ---------- */

  const fetchData = useCallback(async (coachId: string) => {
    try {
      const [statsRes, progsRes, authProgsRes] = await Promise.all([
        fetch(`/api/dashboard/stats?coachId=${encodeURIComponent(coachId)}`),
        fetch('/api/programmes/list'),
        fetch('/api/auth/authorised-programmes', { credentials: 'include' }),
      ])

      if (statsRes.ok) {
        const d = await statsRes.json()
        setStats(d)
      }

      if (progsRes.ok) {
        const d = await progsRes.json()
        setProgrammes(d.programmes ?? d.programs ?? [])
      }

      if (authProgsRes.ok) {
        const d = await authProgsRes.json()
        setHasAuthority((d.programmes || []).length > 0)
      }
    } catch {
      // silently fail — dashboard still renders with defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    const name = localStorage.getItem('coachName')
    const pId = localStorage.getItem('providerId')
    if (!id) {
      router.push('/auth/login')
      return
    }
    setCoachName(name || 'Coach')
    setProviderId(pId || '')
    fetchData(id)
  }, [router, fetchData])

  /* ---------- handlers ---------- */

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('coachId')
    localStorage.removeItem('coachEmail')
    localStorage.removeItem('coachName')
    localStorage.removeItem('providerId')
    router.push('/')
  }

  /* ---------- derived ---------- */

  const conversations = stats?.conversations ?? { total: 0, botHandled: 0, escalated: 0 }
  const botPct =
    conversations.total > 0 ? Math.round((conversations.botHandled / conversations.total) * 100) : 0
  const pendingFaqs = stats?.pendingFaqs ?? 0
  const topCategories = stats?.topCategories ?? []
  const revenue = stats?.payments?.revenueThisMonth ?? stats?.revenueThisMonth ?? 0
  const outstanding = stats?.payments?.outstanding ?? stats?.outstanding ?? 0
  const activeMembers = stats?.activeMembers ?? 0

  /* ---------- loading ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3D8B37] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar onLogout={handleLogout} hasAuthority={hasAuthority} />
      <MobileNav onLogout={handleLogout} hasAuthority={hasAuthority} />

      {/* Main content — offset for sidebar on desktop */}
      <main className="lg:ml-56 px-4 py-6 md:px-8 lg:px-10 max-w-6xl mx-auto">

        {/* ===== Header ===== */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#3D8B37] mb-1 hidden lg:block">
              MyCoachingAssistant
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Welcome, {coachName}
            </h1>
            {providerId && (
              <p className="text-gray-500 text-sm mt-0.5">{providerId}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard/settings"
              className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center shadow-sm"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="hidden lg:flex bg-white text-gray-500 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px] items-center shadow-sm"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* ===== Stats Row ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Active Members */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Members</p>
            <p className="text-2xl font-bold text-gray-900">{activeMembers}</p>
            <div className="mt-2 h-1 w-10 rounded-full bg-[#3D8B37]" />
          </div>

          {/* Revenue This Month */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Revenue This Month</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(revenue)}</p>
            <div className="mt-2 h-1 w-10 rounded-full bg-[#3D8B37]" />
          </div>

          {/* Outstanding */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Outstanding</p>
            <p className={`text-2xl font-bold ${outstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(outstanding)}
            </p>
            <div className={`mt-2 h-1 w-10 rounded-full ${outstanding > 0 ? 'bg-red-500' : 'bg-[#3D8B37]'}`} />
          </div>

          {/* Bot Activity */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Bot Activity</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">
              <span className="text-[#3D8B37]">{conversations.botHandled}</span> handled
              <span className="mx-1 text-gray-300">&middot;</span>
              <span className={conversations.escalated > 0 ? 'text-red-600' : 'text-gray-900'}>{conversations.escalated}</span> escalated
            </p>
            <p className="text-xs text-gray-400 mt-1">this week</p>
          </div>
        </div>

        {/* ===== Programme Cards ===== */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Programmes ({programmes.length})
            </h2>
            <Link
              href="/dashboard/programmes"
              className="bg-[#3D8B37] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#346E30] transition-colors min-h-[44px] flex items-center shadow-sm"
            >
              + New Programme
            </Link>
          </div>

          {programmes.length === 0 ? (
            /* ---------- Empty state ---------- */
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-[#3D8B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">Get started by creating your first programme</p>
              <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                Set up a programme, link a WhatsApp group, and your AI coaching assistant will be live in minutes.
              </p>
              <Link
                href="/dashboard/programmes"
                className="inline-flex items-center bg-[#3D8B37] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#346E30] transition-colors shadow-sm"
              >
                Create your first programme
              </Link>
            </div>
          ) : (
            /* ---------- Programme list ---------- */
            <div className="grid gap-4 sm:grid-cols-2">
              {programmes.map((prog) => {
                const current = prog.memberCount ?? prog.currentMembers ?? 0
                const max = prog.maxCapacity ?? 0
                const pct = capacityPercent(current, max)
                const badge = statusBadge(prog)
                const hasGroup = !!prog.whatsappGroupId
                const isLive = hasGroup
                const name = prog.programName || prog.programmeName || 'Untitled Programme'

                return (
                  <div key={prog.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
                    {/* Top row: name + edit */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{name}</h3>
                        {(prog.skillLevel || prog.targetAudience || prog.venueName) && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            {[prog.skillLevel, prog.targetAudience, prog.venueName].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/dashboard/programmes?edit=${prog.id}`}
                        className="text-[#3D8B37] text-sm font-medium hover:underline ml-3 whitespace-nowrap"
                      >
                        Edit
                      </Link>
                    </div>

                    {/* Capacity bar */}
                    {max > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{current} / {max} members</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${capacityColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Badges */}
                    <div className="flex flex-wrap gap-2 mt-auto">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${badge.cls}`}>
                        {badge.label}
                      </span>

                      {isLive ? (
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          Bot live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
                          Setup incomplete
                        </span>
                      )}

                      {(prog.waitlistCount ?? 0) > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {prog.waitlistCount} waitlisted
                        </span>
                      )}

                      {max > 0 && (
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                          {current} members
                        </span>
                      )}
                    </div>

                    {/* Booking Link */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                      <button
                        onClick={() => copyBookingLink(prog.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#3D8B37] hover:text-[#346E30] transition-colors"
                      >
                        {copiedId === prog.id ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            Copy Booking Link
                          </>
                        )}
                      </button>
                      <Link
                        href={`/join/${prog.id}`}
                        target="_blank"
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        Preview
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== Bot Intelligence Panel ===== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bot Intelligence</h2>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Questions this week</p>
              <p className="text-xl font-bold text-gray-900">{conversations.total}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Handled by bot</p>
              <p className="text-xl font-bold text-[#3D8B37]">
                {conversations.botHandled}
                <span className="text-sm font-normal text-gray-400 ml-1">({botPct}%)</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Escalated to coach</p>
              <p className={`text-xl font-bold ${conversations.escalated > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {conversations.escalated}
              </p>
            </div>
          </div>

          {/* Top categories */}
          {topCategories.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Top Question Categories</p>
              <div className="flex flex-wrap gap-2">
                {topCategories.map((cat, i) => (
                  <span
                    key={cat.category}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
                  >
                    {cat.category} ({cat.count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pending FAQ alert */}
          {pendingFaqs > 0 && (
            <Link
              href="/dashboard/learning"
              className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 hover:bg-amber-100 transition-colors"
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 text-sm font-bold">
                {pendingFaqs}
              </span>
              <span className="text-sm text-amber-800 font-medium">
                You have {pendingFaqs} unanswered question{pendingFaqs > 1 ? 's' : ''} awaiting your input
              </span>
              <svg className="w-4 h-4 text-amber-500 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {/* ===== Quick Actions ===== */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/dashboard/programmes"
              className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#3D8B37]/30 hover:shadow-md transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#3D8B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700">New Programme</span>
            </Link>

            <Link
              href="/dashboard/members"
              className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#3D8B37]/30 hover:shadow-md transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700">Manage Members</span>
            </Link>

            <Link
              href="/dashboard/learning"
              className="relative flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#3D8B37]/30 hover:shadow-md transition-all text-center"
            >
              {pendingFaqs > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {pendingFaqs > 9 ? '9+' : pendingFaqs}
                </span>
              )}
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700">Review Questions</span>
            </Link>

            <Link
              href="/dashboard/settings"
              className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#3D8B37]/30 hover:shadow-md transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700">Settings</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
