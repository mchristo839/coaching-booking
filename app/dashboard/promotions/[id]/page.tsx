'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface CampDay {
  date: string
  label: string
  price_gbp: number
  capacity?: number | null
}

interface Promotion {
  id: string
  promotion_type: string
  title: string | null
  detail: string
  generated_message: string | null
  status: string
  slug: string | null
  send_mode: string
  payment_link: string | null
  camp_days: CampDay[] | null
  created_at: string
  sent_at: string | null
}

interface Target {
  id: string
  programme_id: string
  programme_name: string
  whatsapp_group_id: string | null
  send_status: string
  error: string | null
}

interface MessageableMember {
  id: string
  display_name: string
  jid: string
  opted_out: boolean
}

interface CampBooking {
  id: string
  parent_jid: string
  parent_name: string | null
  child_name: string | null
  days_selected: number[] | null
  total_gbp: string | null
  state:
    | 'awaiting_day_selection'
    | 'awaiting_payment_confirmation'
    | 'paid_self_reported'
    | 'confirmed'
    | 'cancelled'
    | 'expired'
  payment_self_reported_at: string | null
  payment_confirmed_at: string | null
  parent_phone: string | null
  created_at: string
}

export default function PromotionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedMessage, setEditedMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Holiday camp state (only meaningful when promotion_type === 'holiday_camp')
  const [bookings, setBookings] = useState<CampBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [sendingCohort, setSendingCohort] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // Refer-a-friend: DM the link to individual members
  const [members, setMembers] = useState<MessageableMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [sendingDm, setSendingDm] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/promotions/${id}/detail`, { credentials: 'include' })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      if (!res.ok) {
        setError('Failed to load promotion')
        return
      }
      const data = await res.json()
      setPromotion(data.promotion)
      setEditedMessage(data.promotion?.generated_message || '')
      setTargets(data.targets || [])
    } catch {
      setError('Failed to load promotion')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    load()
  }, [load])

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)
    try {
      const res = await fetch(`/api/promotions/${id}/bookings`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setBookings(data.bookings || [])
    } finally {
      setBookingsLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (promotion?.promotion_type === 'holiday_camp') {
      loadBookings()
    }
  }, [promotion?.promotion_type, loadBookings])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/promotions/${id}/members`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setMembers(data.members || [])
    } finally {
      setMembersLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (promotion?.promotion_type === 'refer_a_friend') {
      loadMembers()
    }
  }, [promotion?.promotion_type, loadMembers])

  function toggleMember(memberId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  function toggleSelectAll() {
    const selectable = members.filter((m) => !m.opted_out).map((m) => m.id)
    setSelectedMemberIds((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable)
    )
  }

  async function handleSendDm() {
    const ids = Array.from(selectedMemberIds)
    if (ids.length === 0) return
    if (!confirm(`DM the referral link to ${ids.length} member${ids.length === 1 ? '' : 's'}? Each message includes a STOP opt-out.`)) return
    setSendingDm(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/promotions/${id}/send-dm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send DMs')
        return
      }
      const skippedNote = data.skipped?.length ? `, ${data.skipped.length} skipped` : ''
      setSuccess(`DM sent to ${data.sent} member${data.sent === 1 ? '' : 's'}. ${data.failed} failed${skippedNote}.`)
      setSelectedMemberIds(new Set())
      await loadMembers()
    } finally {
      setSendingDm(false)
    }
  }

  async function handleSendCohort() {
    if (!confirm('Send the camp invite to every parent on the cohort? Each child gets one WhatsApp message.')) return
    setSendingCohort(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/promotions/${id}/send-camp-cohort`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send camp cohort')
        return
      }
      setSuccess(`Sent ${data.sent} invite${data.sent === 1 ? '' : 's'}. ${data.skipped} skipped, ${data.failed} failed.`)
      await loadBookings()
    } finally {
      setSendingCohort(false)
    }
  }

  async function handleConfirmBooking(bookingId: string) {
    setConfirmingId(bookingId)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}/bookings/${bookingId}/confirm`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to confirm booking')
        return
      }
      await loadBookings()
    } finally {
      setConfirmingId(null)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}/regenerate`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to regenerate')
        return
      }
      setPromotion((prev) => (prev ? { ...prev, generated_message: data.message } : prev))
      setEditedMessage(data.message || '')
    } finally {
      setRegenerating(false)
    }
  }

  async function persistEdits(): Promise<boolean> {
    const body = editedMessage.trim()
    if (!body) {
      setError('Message cannot be empty')
      return false
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generated_message: body }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save edits')
        return false
      }
      setPromotion((prev) => (prev ? { ...prev, generated_message: body } : prev))
      return true
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const ok = await persistEdits()
    if (ok) setSuccess('Edits saved.')
  }

  async function handleSend() {
    // Persist any unsaved edits before sending so the recipients get the
    // edited copy, not the last-saved AI version.
    const isDirty = editedMessage !== (promotion?.generated_message || '')
    if (isDirty) {
      const ok = await persistEdits()
      if (!ok) return
    }
    if (!confirm('Send this message to all target groups now?')) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}/send`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send')
        return
      }
      setSuccess(`Sent to ${data.sent} group(s). ${data.failed} failed.`)
      load()
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    )
  }

  if (!promotion) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-100">Promotion not found</div>
      </div>
    )
  }

  const isDraft = promotion.status === 'draft'

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/control-centre"
          className="text-ink-muted hover:text-brand-700 text-sm transition-colors"
        >
          ← Control Centre
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Promotion preview</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm border border-green-100">{success}</div>
      )}

      <div className="card shadow-card mb-6">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="font-display font-semibold text-ink">
              {promotion.title || `${promotion.promotion_type.replace(/_/g, ' ')}`}
            </h2>
            <p className="text-xs text-ink-muted mt-1">Status: {promotion.status}</p>
          </div>
        </div>

        {isDraft ? (
          <>
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              rows={Math.max(8, editedMessage.split('\n').length + 1)}
              className="input-field bg-surface-muted font-mono"
              placeholder="(no message generated yet — click Regenerate)"
            />
            {(() => {
              const isDirty = editedMessage !== (promotion.generated_message || '')
              return (
                <div className="mt-4 flex gap-2 flex-wrap items-center">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating || sending || saving}
                    className="bg-surface-muted text-ink px-4 py-2 rounded-lg text-sm font-medium hover:bg-line disabled:opacity-50 transition-colors"
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving || sending}
                    className="bg-surface-muted text-ink px-4 py-2 rounded-lg text-sm font-medium hover:bg-line disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save edits'}
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || saving}
                    className="bg-brand-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {sending ? 'Sending...' : `Send to ${targets.length} group${targets.length === 1 ? '' : 's'}`}
                  </button>
                  {isDirty && (
                    <span className="text-xs text-amber-600">Unsaved changes — sending will save first</span>
                  )}
                </div>
              )
            })()}
          </>
        ) : (
          <div className="bg-surface-muted rounded-lg p-4 whitespace-pre-wrap text-sm text-ink font-mono">
            {promotion.generated_message || '(no message generated)'}
          </div>
        )}
      </div>

      <div className="card shadow-card">
        <h2 className="font-display font-semibold text-ink mb-3">Target groups</h2>
        <ul className="space-y-2">
          {targets.map((t) => (
            <li key={t.id} className="flex justify-between items-center text-sm">
              <span className="text-ink">{t.programme_name}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                t.send_status === 'sent' ? 'bg-green-100 text-green-700' :
                t.send_status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-surface-muted text-ink-muted'
              }`}>
                {t.send_status}{t.error ? ` — ${t.error}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {promotion.promotion_type === 'refer_a_friend' && (
        <div className="bg-white rounded-xl shadow-sm p-5 mt-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h2 className="font-semibold text-gray-900">Send to individual members</h2>
              <p className="text-xs text-gray-500 mt-1">
                DM the referral link straight to members in the group. Each message
                includes a STOP opt-out, and the link is pre-tagged to the member so
                their referrals are credited automatically.
              </p>
            </div>
            <button
              onClick={handleSendDm}
              disabled={sendingDm || selectedMemberIds.size === 0}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              {sendingDm ? 'Sending…' : `Send to ${selectedMemberIds.size}`}
            </button>
          </div>

          {membersLoading ? (
            <p className="text-sm text-gray-500">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500">
              No contactable members yet. Members appear here once they&apos;ve signed up
              and we have a usable phone number for them.
            </p>
          ) : (
            <>
              <button
                onClick={toggleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-700 mb-2"
              >
                {selectedMemberIds.size === members.filter((m) => !m.opted_out).length
                  ? 'Clear selection'
                  : 'Select all'}
              </button>
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(m.id)}
                      disabled={m.opted_out}
                      onChange={() => toggleMember(m.id)}
                      className="h-4 w-4"
                    />
                    <span className={`text-sm ${m.opted_out ? 'text-gray-400' : 'text-gray-900'}`}>
                      {m.display_name}
                    </span>
                    {m.opted_out && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                        opted out
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {promotion.promotion_type === 'holiday_camp' && (
        <div className="bg-white rounded-xl shadow-sm p-5 mt-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-gray-900">Camp bookings</h2>
            <button
              onClick={handleSendCohort}
              disabled={sendingCohort}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {sendingCohort ? 'Sending invites…' : 'Send invites to cohort'}
            </button>
          </div>

          {promotion.camp_days && promotion.camp_days.length > 0 && (
            <div className="text-xs text-gray-500 mb-4">
              Days:{' '}
              {promotion.camp_days.map((d, i) => (
                <span key={i} className="mr-2">
                  <span className="font-mono">{String.fromCharCode(97 + i)}</span> = {d.label} (£{Number(d.price_gbp).toFixed(2)})
                </span>
              ))}
            </div>
          )}

          {bookingsLoading ? (
            <p className="text-sm text-gray-500">Loading bookings…</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-gray-500">
              No bookings yet. Click &quot;Send invites to cohort&quot; to message every parent in the targeted programmes.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Child</th>
                    <th className="text-left px-2 py-2 font-medium">Parent</th>
                    <th className="text-left px-2 py-2 font-medium">Days</th>
                    <th className="text-right px-2 py-2 font-medium">Total</th>
                    <th className="text-left px-2 py-2 font-medium">Status</th>
                    <th className="text-right px-5 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const daysStr = b.days_selected && b.days_selected.length > 0
                      ? b.days_selected
                          .map((i) => promotion.camp_days?.[i]?.label || String.fromCharCode(97 + i))
                          .join(', ')
                      : '—'
                    const total = b.total_gbp ? `£${Number(b.total_gbp).toFixed(2)}` : '—'
                    return (
                      <tr key={b.id} className="border-b border-gray-100">
                        <td className="px-5 py-2 text-gray-900">{b.child_name || '—'}</td>
                        <td className="px-2 py-2 text-gray-700">
                          <div>{b.parent_name || '—'}</div>
                          {b.parent_phone && (
                            <div className="text-xs text-gray-400">{b.parent_phone}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-gray-700">{daysStr}</td>
                        <td className="px-2 py-2 text-right text-gray-900 font-medium">{total}</td>
                        <td className="px-2 py-2">
                          <StateBadge state={b.state} />
                        </td>
                        <td className="px-5 py-2 text-right">
                          {b.state === 'paid_self_reported' ? (
                            <button
                              onClick={() => handleConfirmBooking(b.id)}
                              disabled={confirmingId === b.id}
                              className="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              {confirmingId === b.id ? 'Confirming…' : 'Confirm payment'}
                            </button>
                          ) : b.state === 'confirmed' ? (
                            <span className="text-xs text-green-700">✓ Confirmed</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: CampBooking['state'] }) {
  const map: Record<CampBooking['state'], { label: string; cls: string }> = {
    awaiting_day_selection: { label: 'Awaiting days', cls: 'bg-gray-100 text-gray-600' },
    awaiting_payment_confirmation: { label: 'Awaiting payment', cls: 'bg-yellow-100 text-yellow-700' },
    paid_self_reported: { label: 'Self-reported paid', cls: 'bg-blue-100 text-blue-700' },
    confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
    expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-500' },
  }
  const { label, cls } = map[state]
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{label}</span>
}
