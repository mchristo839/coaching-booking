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

interface Escalation {
  id: string
  sender_name: string | null
  message_text: string
  category: string | null
  escalation_type: string | null
  created_at: string
  programme_name: string | null
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
  'bg-brand-50 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-lime-100 text-lime-700',
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
  return 'bg-brand-600'
}

function statusBadge(programme: Programme): { label: string; cls: string } {
  const pct = capacityPercent(programme.memberCount ?? programme.currentMembers ?? 0, programme.maxCapacity ?? 0)
  if (programme.programmeStatus) {
    const s = programme.programmeStatus.toLowerCase()
    if (s === 'full') return { label: 'Full', cls: 'bg-red-100 text-red-700' }
    if (s === 'almost full') return { label: 'Almost Full', cls: 'bg-amber-100 text-amber-700' }
    if (s === 'open') return { label: 'Open', cls: 'bg-brand-50 text-brand-700' }
    return { label: programme.programmeStatus || 'Open', cls: 'bg-surface-muted text-ink-muted' }
  }
  if (pct >= 95) return { label: 'Full', cls: 'bg-red-100 text-red-700' }
  if (pct >= 80) return { label: 'Almost Full', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Open', cls: 'bg-brand-50 text-brand-700' }
}

/* ------------------------------------------------------------------ */
/*  Sidebar / Nav                                                      */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string
  href: string
  active?: boolean
  requiresAuthority?: boolean
  fitnessOnly?: boolean      // hide on vertical='sport' (default)
  labelByVertical?: { sport: string; fitness: string }
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  {
    label: 'Control Centre',
    href: '/dashboard/control-centre',
    requiresAuthority: true,
    labelByVertical: { sport: 'Control Centre', fitness: 'Studio Control' },
  },
  {
    label: 'Programmes',
    href: '/dashboard/programmes',
    labelByVertical: { sport: 'Programmes', fitness: 'Classes' },
  },
  {
    label: 'Members',
    href: '/dashboard/members',
    labelByVertical: { sport: 'Members', fitness: 'Clients' },
  },
  { label: 'Inbox', href: '/dashboard/inbox' },
  { label: 'Referrals', href: '/dashboard/referrals', requiresAuthority: true },
  // Calendar booking (Flow 2 + 12) is useful for sport coaches too — solo PT,
  // 1:1 skills work, individual goalkeeper coaching, etc. Label-swap so the
  // sport vertical sees the appropriate noun.
  {
    label: '1:1 availability',
    href: '/dashboard/availability',
    labelByVertical: { sport: '1:1 availability', fitness: 'PT availability' },
  },
  {
    label: '1:1 Sessions',
    href: '/dashboard/sessions',
    labelByVertical: { sport: '1:1 Sessions', fitness: 'PT Sessions' },
  },
  // Post-session feedback flow stays fitness-only — designed for studio
  // 1:1 PT delivery, not grassroots youth sport sessions.
  { label: 'Feedback', href: '/dashboard/feedback', fitnessOnly: true },
  { label: 'Learning Log', href: '/dashboard/learning' },
  { label: 'Settings', href: '/dashboard/settings' },
]

function visibleNavItems(hasAuthority: boolean, vertical: 'sport' | 'fitness'): NavItem[] {
  return NAV_ITEMS
    .filter((item) => !item.requiresAuthority || hasAuthority)
    .filter((item) => !item.fitnessOnly || vertical === 'fitness')
    .map((item) => ({
      ...item,
      label: item.labelByVertical ? item.labelByVertical[vertical] : item.label,
    }))
}

function Sidebar({ onLogout, hasAuthority, vertical }: { onLogout: () => void; hasAuthority: boolean; vertical: 'sport' | 'fitness' }) {
  const items = visibleNavItems(hasAuthority, vertical)
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen bg-surface border-r border-line py-6 px-4 fixed left-0 top-0">
      <div className="mb-8">
        <p className="eyebrow">MyCoachingAssistant</p>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              item.active
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        onClick={onLogout}
        className="mt-auto px-3 py-2 rounded-lg text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors text-left"
      >
        Log Out
      </button>
    </aside>
  )
}

function MobileNav({ onLogout, hasAuthority, vertical }: { onLogout: () => void; hasAuthority: boolean; vertical: 'sport' | 'fitness' }) {
  const [open, setOpen] = useState(false)
  const items = visibleNavItems(hasAuthority, vertical)

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-surface border-b border-line px-4 py-3">
        <p className="eyebrow">MyCoachingAssistant</p>
        <button
          onClick={() => setOpen(!open)}
          className="text-ink-muted p-2 rounded-lg hover:bg-surface-muted"
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
        <nav className="bg-surface border-b border-line px-4 py-2 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => { setOpen(false); onLogout() }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors text-left"
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
  const [vertical, setVertical] = useState<'sport' | 'fitness'>(() => {
    if (typeof window === 'undefined') return 'sport'
    return (window.localStorage.getItem('coachVertical') === 'fitness' ? 'fitness' : 'sport')
  })
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [camps, setCamps] = useState<{ id: string; title: string | null; status: string | null }[]>([])

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
      const [statsRes, progsRes, authProgsRes, meRes, escRes, promosRes] = await Promise.all([
        fetch(`/api/dashboard/stats?coachId=${encodeURIComponent(coachId)}`),
        fetch('/api/programmes/list'),
        fetch('/api/auth/authorised-programmes', { credentials: 'include' }),
        fetch('/api/auth/me', { credentials: 'include' }),
        fetch('/api/escalations', { credentials: 'include' }),
        fetch('/api/promotions', { credentials: 'include' }),
      ])

      if (promosRes.ok) {
        const d = await promosRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const holidayCamps = (d.promotions || [])
          .filter((p: any) => p.promotion_type === 'holiday_camp')
          .map((p: any) => ({ id: p.id, title: p.title, status: p.status }))
        setCamps(holidayCamps)
      }

      if (escRes.ok) {
        const d = await escRes.json()
        setEscalations(d.escalations ?? [])
      }

      if (meRes.ok) {
        const d = await meRes.json()
        const v: 'sport' | 'fitness' = d.vertical === 'fitness' ? 'fitness' : 'sport'
        setVertical(v)
        window.localStorage.setItem('coachVertical', v)
      }

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

  async function acknowledgeEscalations(ids?: string[]) {
    const body = ids ? { ids } : { all: true }
    setAckingId(ids && ids.length === 1 ? ids[0] : 'all')
    try {
      const res = await fetch('/api/escalations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setEscalations((prev) =>
          ids ? prev.filter((e) => !ids.includes(e.id)) : []
        )
      }
    } catch {
      // leave the list as-is; coach can retry
    } finally {
      setAckingId(null)
    }
  }

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
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-ink-muted text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={handleLogout} hasAuthority={hasAuthority} vertical={vertical} />
      <MobileNav onLogout={handleLogout} hasAuthority={hasAuthority} vertical={vertical} />

      {/* Main content — offset for sidebar on desktop */}
      <main className="lg:ml-56 px-4 py-6 md:px-8 lg:px-10 max-w-6xl mx-auto">

        {/* ===== Header ===== */}
        <div className="reveal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <p className="eyebrow mb-1 hidden lg:block">
              MyCoachingAssistant
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-ink">
              Welcome, {coachName}
            </h1>
            {providerId && (
              <p className="text-ink-muted text-sm mt-0.5">{providerId}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard/settings"
              className="btn-secondary text-sm"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="btn-secondary text-sm hidden lg:inline-flex"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* ===== Escalations needing acknowledgement ===== */}
        {escalations.length > 0 && (
          <div className="reveal mb-8 rounded-xl border border-amber-300 bg-amber-50 shadow-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🟡</span>
                <h2 className="font-display font-semibold text-ink text-sm">
                  {escalations.length} escalation{escalations.length === 1 ? '' : 's'} need your attention
                </h2>
              </div>
              <button
                onClick={() => acknowledgeEscalations()}
                disabled={ackingId !== null}
                className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
              >
                {ackingId === 'all' ? 'Clearing…' : 'Acknowledge all'}
              </button>
            </div>
            <ul className="divide-y divide-amber-200">
              {escalations.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-ink">{e.sender_name || 'Someone'}</span>
                      {e.escalation_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                          {e.escalation_type}
                        </span>
                      )}
                      {e.programme_name && (
                        <span className="text-[10px] text-ink-muted">· {e.programme_name}</span>
                      )}
                      <span className="text-[10px] text-ink-muted">
                        · {new Date(e.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted truncate">{e.message_text}</p>
                  </div>
                  <button
                    onClick={() => acknowledgeEscalations([e.id])}
                    disabled={ackingId !== null}
                    className="btn-secondary text-xs shrink-0 px-3 py-1.5 min-h-0"
                  >
                    {ackingId === e.id ? '…' : 'Acknowledge'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ===== Stats Row ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Active Members */}
          <div className="card shadow-card">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Active Members</p>
            <p className="text-2xl font-bold text-ink">{activeMembers}</p>
            <div className="mt-2 h-1 w-10 rounded-full bg-brand-600" />
          </div>

          {/* Revenue This Month */}
          <div className="card shadow-card">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Revenue This Month</p>
            <p className="text-2xl font-bold text-ink">{formatCurrency(revenue)}</p>
            <div className="mt-2 h-1 w-10 rounded-full bg-brand-600" />
          </div>

          {/* Outstanding */}
          <div className="card shadow-card">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Outstanding</p>
            <p className={`text-2xl font-bold ${outstanding > 0 ? 'text-red-600' : 'text-ink'}`}>
              {formatCurrency(outstanding)}
            </p>
            <div className={`mt-2 h-1 w-10 rounded-full ${outstanding > 0 ? 'bg-red-500' : 'bg-brand-600'}`} />
          </div>

          {/* Bot Activity */}
          <div className="card shadow-card">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Bot Activity</p>
            <p className="text-sm font-semibold text-ink mt-1">
              <span className="text-brand-700">{conversations.botHandled}</span> handled
              <span className="mx-1 text-line">&middot;</span>
              <span className={conversations.escalated > 0 ? 'text-red-600' : 'text-ink'}>{conversations.escalated}</span> escalated
            </p>
            <p className="text-xs text-ink-muted mt-1">this week</p>
          </div>
        </div>

        {/* ===== Holiday Camps ===== */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-display text-lg font-semibold text-ink">
              Holiday Camps ({camps.length})
            </h2>
            <Link href="/dashboard/camps/new" className="btn-primary text-sm">
              + New Camp
            </Link>
          </div>
          {camps.length === 0 ? (
            <div className="card shadow-card text-sm text-ink-muted">
              No camps yet. Create one to post a poll and take bookings.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {camps.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/promotions/${c.id}`}
                  className="card shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{c.title || 'Untitled camp'}</span>
                    {c.status && (
                      <span className="text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700 capitalize shrink-0">{c.status}</span>
                    )}
                  </div>
                  <span className="block text-xs text-ink-muted mt-1">Manage bookings &amp; confirm payments →</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ===== Programme Cards ===== */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-display text-lg font-semibold text-ink">
              Programmes ({programmes.length})
            </h2>
            <Link
              href="/dashboard/programmes"
              className="btn-primary text-sm"
            >
              + New Programme
            </Link>
          </div>

          {programmes.length === 0 ? (
            /* ---------- Empty state ---------- */
            <div className="card shadow-card p-10 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-ink mb-2">Get started by creating your first programme</p>
              <p className="text-ink-muted text-sm mb-6 max-w-sm mx-auto">
                Set up a programme, link a WhatsApp group, and your AI coaching assistant will be live in minutes.
              </p>
              <Link
                href="/dashboard/programmes"
                className="btn-primary"
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
                  <div key={prog.id} className="card shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover flex flex-col">
                    {/* Top row: name + edit */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-display font-semibold text-ink">{name}</h3>
                        {(prog.skillLevel || prog.targetAudience || prog.venueName) && (
                          <p className="text-sm text-ink-muted mt-0.5">
                            {[prog.skillLevel, prog.targetAudience, prog.venueName].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/dashboard/programmes?edit=${prog.id}`}
                        className="text-brand-700 text-sm font-medium hover:underline ml-3 whitespace-nowrap"
                      >
                        Edit
                      </Link>
                    </div>

                    {/* Capacity bar */}
                    {max > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-ink-muted mb-1">
                          <span>{current} / {max} members</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
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
                        <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-600 inline-block" />
                          Bot live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded">
                          Setup incomplete
                        </span>
                      )}

                      {(prog.waitlistCount ?? 0) > 0 && (
                        <span className="text-xs text-ink-muted bg-surface-muted px-2 py-1 rounded">
                          {prog.waitlistCount} waitlisted
                        </span>
                      )}

                      {max > 0 && (
                        <span className="text-xs text-ink-muted bg-surface-muted px-2 py-1 rounded">
                          {current} members
                        </span>
                      )}
                    </div>

                    {/* Booking Link */}
                    <div className="mt-3 pt-3 border-t border-line flex gap-2">
                      <button
                        onClick={() => copyBookingLink(prog.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-600 transition-colors"
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
                        className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
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
        <div className="card shadow-card mb-8">
          <h2 className="font-display text-lg font-semibold text-ink mb-4">Bot Intelligence</h2>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Questions this week</p>
              <p className="text-xl font-bold text-ink">{conversations.total}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Handled by bot</p>
              <p className="text-xl font-bold text-brand-700">
                {conversations.botHandled}
                <span className="text-sm font-normal text-ink-muted ml-1">({botPct}%)</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Escalated to coach</p>
              <p className={`text-xl font-bold ${conversations.escalated > 0 ? 'text-red-600' : 'text-ink'}`}>
                {conversations.escalated}
              </p>
            </div>
          </div>

          {/* Top categories */}
          {topCategories.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Top Question Categories</p>
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
          <h2 className="font-display text-lg font-semibold text-ink mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/dashboard/programmes"
              className="group flex flex-col items-center gap-2 card shadow-card p-4 hover:border-brand-300 hover:-translate-y-1 hover:shadow-card-hover transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center transition-colors group-hover:bg-brand-100">
                <svg className="w-5 h-5 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-ink">New Programme</span>
            </Link>

            <Link
              href="/dashboard/members"
              className="group flex flex-col items-center gap-2 card shadow-card p-4 hover:border-brand-300 hover:-translate-y-1 hover:shadow-card-hover transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center transition-colors group-hover:bg-brand-100">
                <svg className="w-5 h-5 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-ink">Manage Members</span>
            </Link>

            <Link
              href="/dashboard/leads"
              className="group flex flex-col items-center gap-2 card shadow-card p-4 hover:border-brand-300 hover:-translate-y-1 hover:shadow-card-hover transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center transition-colors group-hover:bg-brand-100">
                <svg className="w-5 h-5 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-sm font-medium text-ink">Leads Pipeline</span>
            </Link>

            <Link
              href="/dashboard/learning"
              className="group relative flex flex-col items-center gap-2 card shadow-card p-4 hover:border-brand-300 hover:-translate-y-1 hover:shadow-card-hover transition-all text-center"
            >
              {pendingFaqs > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {pendingFaqs > 9 ? '9+' : pendingFaqs}
                </span>
              )}
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center transition-colors group-hover:bg-brand-100">
                <svg className="w-5 h-5 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-ink">Review Questions</span>
            </Link>

            <Link
              href="/dashboard/settings"
              className="group flex flex-col items-center gap-2 card shadow-card p-4 hover:border-brand-300 hover:-translate-y-1 hover:shadow-card-hover transition-all text-center"
            >
              <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center transition-colors group-hover:bg-brand-50">
                <svg className="w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-ink">Settings</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
