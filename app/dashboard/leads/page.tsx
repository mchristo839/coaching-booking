'use client'

import { useState, useEffect, useCallback } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LeadSource = 'website' | 'email_phone' | 'calendly' | 'meta' | 'other'
type LeadStage =
  | 'lead'
  | 'no_interest'
  | 'free_trial_booked'
  | 'no_show_cancel'
  | 'free_trial_not_joined'
  | 'signup_21day'
  | 'not_joined_21day'
  | 'joined'
  | 'ex_member'

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: LeadSource
  stage: LeadStage
  trial_date: string | null
  notes: string | null
  created_at: string
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  email_phone: 'Email / phone',
  calendly: 'Calendly',
  meta: 'Meta',
  other: 'Other',
}

const STAGE_LABELS: Record<LeadStage, string> = {
  lead: 'Lead',
  no_interest: 'No interest',
  free_trial_booked: 'Free trial booked',
  no_show_cancel: 'No show / cancel',
  free_trial_not_joined: 'Free trial — not joined',
  signup_21day: '21-day sign-up',
  not_joined_21day: '21-day — not joined',
  joined: 'Joined',
  ex_member: 'Ex-member',
}

// The "success path" gets its own column. Everything else (drop-offs,
// no-shows, lapsed) is grouped into one "Off pipeline" list — 9 full-width
// Kanban columns would be more clutter than the funnel needs for v1.
const PIPELINE_STAGES: LeadStage[] = ['lead', 'free_trial_booked', 'signup_21day', 'joined']
const OFF_PIPELINE_STAGES: LeadStage[] = [
  'no_interest',
  'no_show_cancel',
  'free_trial_not_joined',
  'not_joined_21day',
  'ex_member',
]
const ALL_STAGES: LeadStage[] = [...PIPELINE_STAGES, ...OFF_PIPELINE_STAGES]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(iso)
    )
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/*  Add-lead form                                                      */
/* ------------------------------------------------------------------ */

function AddLeadForm({ onAdded, onCancel }: { onAdded: (lead: Lead) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<LeadSource>('other')
  const [trialDate, setTrialDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          source,
          trialDate: trialDate || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to add lead')
      }
      const data = await res.json()
      onAdded(data.lead as Lead)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-line rounded-xl p-6 mb-6">
      <h2 className="font-display font-semibold text-ink mb-4">Add lead</h2>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name *</label>
          <input className="input-field w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Source</label>
          <select
            className="input-field w-full"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
          >
            {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Phone</label>
          <input className="input-field w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Email</label>
          <input
            type="email"
            className="input-field w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Trial date</label>
          <input
            type="date"
            className="input-field w-full"
            value={trialDate}
            onChange={(e) => setTrialDate(e.target.value)}
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-ink mb-1">Notes</label>
        <textarea
          className="input-field w-full"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
          {saving ? 'Adding…' : 'Add lead'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/*  Lead card                                                          */
/* ------------------------------------------------------------------ */

function LeadCard({
  lead,
  onStageChange,
  onDelete,
}: {
  lead: Lead
  onStageChange: (id: string, stage: LeadStage) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-ink">{lead.name}</p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 whitespace-nowrap">
          {SOURCE_LABELS[lead.source]}
        </span>
      </div>
      {(lead.phone || lead.email) && (
        <p className="text-xs text-ink-muted mb-1">{[lead.phone, lead.email].filter(Boolean).join(' · ')}</p>
      )}
      {lead.trial_date && <p className="text-xs text-ink-muted mb-1">Trial: {formatDate(lead.trial_date)}</p>}
      {lead.notes && <p className="text-xs text-ink-muted mb-2 line-clamp-2">{lead.notes}</p>}
      <div className="flex items-center justify-between gap-2 mt-3">
        <select
          className="input-field text-xs py-1.5 flex-1"
          value={lead.stage}
          onChange={(e) => onStageChange(lead.id, e.target.value as LeadStage)}
        >
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(lead.id)}
          className="text-xs text-ink-muted hover:text-red-600 transition-colors"
          title="Delete lead"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load leads')
      const data = await res.json()
      setLeads(data.leads as Lead[])
    } catch {
      setError('Failed to load leads.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const handleStageChange = async (id: string, stage: LeadStage) => {
    // Optimistic update — snap back on failure.
    const prev = leads
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)))
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) throw new Error('Failed to update stage')
    } catch {
      setLeads(prev)
      setError('Failed to move lead — please try again.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    const prev = leads
    setLeads((ls) => ls.filter((l) => l.id !== id))
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('Failed to delete lead')
    } catch {
      setLeads(prev)
      setError('Failed to delete lead — please try again.')
    }
  }

  const byStage = (stage: LeadStage) => leads.filter((l) => l.stage === stage)
  const offPipelineLeads = leads.filter((l) => OFF_PIPELINE_STAGES.includes(l.stage))

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Leads</h1>
          <p className="text-sm text-ink-muted mt-1">
            {leads.length} lead{leads.length === 1 ? '' : 's'} total
          </p>
        </div>
        <button onClick={() => setShowAddForm((v) => !v)} className="btn-primary text-sm">
          {showAddForm ? 'Close' : '+ Add lead'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
      )}

      {showAddForm && (
        <AddLeadForm
          onAdded={(lead) => {
            setLeads((ls) => [lead, ...ls])
            setShowAddForm(false)
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-ink-muted">No leads yet. Click &quot;Add lead&quot; to get started.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-ink">{STAGE_LABELS[stage]}</h2>
                  <span className="text-xs text-ink-muted">{byStage(stage).length}</span>
                </div>
                <div className="space-y-3">
                  {byStage(stage).map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onStageChange={handleStageChange} onDelete={handleDelete} />
                  ))}
                  {byStage(stage).length === 0 && (
                    <p className="text-xs text-ink-muted border border-dashed border-line rounded-xl p-4 text-center">
                      Nothing here
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {offPipelineLeads.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Off pipeline</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {offPipelineLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onStageChange={handleStageChange} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
