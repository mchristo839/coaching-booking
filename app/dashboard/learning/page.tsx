'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Faq {
  id: string
  programme_id: string
  programme_name: string | null
  question: string
  answer: string
  category: string | null
  source: string | null
  status: string
  times_asked: number
}

interface Programme {
  id: string
  programName: string
  programmeName?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sourceBadge(source: string | null): { label: string; cls: string } {
  switch (source?.toLowerCase()) {
    case 'coach':
      return { label: 'Coach', cls: 'bg-brand-50 text-brand-700' }
    case 'preloaded':
      return { label: 'Preloaded', cls: 'bg-surface-muted text-ink-muted' }
    case 'learned':
      return { label: 'Learned', cls: 'bg-brand-100 text-brand-800' }
    default:
      return { label: source || 'Unknown', cls: 'bg-surface-muted text-ink-muted' }
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PendingCard({
  faq,
  onApprove,
  onCoachOnly,
}: {
  faq: Faq
  onApprove: (id: string, answer: string) => Promise<void>
  onCoachOnly: (id: string) => Promise<void>
}) {
  const [editMode, setEditMode] = useState(false)
  const [answer, setAnswer] = useState(faq.answer)
  const [saving, setSaving] = useState(false)

  async function handleApprove() {
    setSaving(true)
    await onApprove(faq.id, answer)
    setSaving(false)
  }

  async function handleCoachOnly() {
    setSaving(true)
    await onCoachOnly(faq.id)
    setSaving(false)
  }

  return (
    <div className="bg-surface rounded-xl shadow-card border border-amber-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="font-semibold text-ink">{faq.question}</p>
        {faq.programme_name && (
          <span className="text-xs bg-surface-muted text-ink-muted px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
            {faq.programme_name}
          </span>
        )}
      </div>

      {editMode ? (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          className="input-field mb-3 resize-y"
        />
      ) : (
        <div className="bg-surface-muted rounded-lg px-4 py-3 text-sm text-ink-muted mb-3">
          <p className="text-xs text-ink-muted mb-1 uppercase tracking-wide font-medium">Bot suggested answer</p>
          {answer}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {editMode ? (
          <button
            onClick={handleApprove}
            disabled={saving}
            className="btn-primary text-sm px-4 py-2"
          >
            {saving ? 'Saving...' : 'Save & Approve'}
          </button>
        ) : (
          <>
            <button
              onClick={handleApprove}
              disabled={saving}
              className="btn-primary text-sm px-4 py-2"
            >
              {saving ? 'Saving...' : 'Approve'}
            </button>
            <button
              onClick={() => setEditMode(true)}
              className="btn-secondary text-sm px-4 py-2"
            >
              Edit & Approve
            </button>
          </>
        )}
        <button
          onClick={handleCoachOnly}
          disabled={saving}
          className="bg-white text-amber-700 px-4 py-2 rounded-lg text-sm font-medium border border-amber-200 hover:bg-amber-50 transition-colors disabled:opacity-50 min-h-[44px]"
        >
          Coach Only
        </button>
      </div>
    </div>
  )
}

function FaqRow({
  faq,
  onUpdate,
  onDelete,
}: {
  faq: Faq
  onUpdate: (id: string, question: string, answer: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [question, setQuestion] = useState(faq.question)
  const [answer, setAnswer] = useState(faq.answer)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const src = sourceBadge(faq.source)

  async function handleSave() {
    setSaving(true)
    await onUpdate(faq.id, question, answer)
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    setSaving(true)
    await onDelete(faq.id)
    setSaving(false)
  }

  if (editing) {
    return (
      <div className="bg-surface rounded-lg border border-line p-4">
        <label className="block text-xs font-medium text-ink-muted mb-1">Question</label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="input-field mb-3"
        />
        <label className="block text-xs font-medium text-ink-muted mb-1">Answer</label>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          className="input-field mb-3 resize-y"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-3 py-1.5 min-h-0"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setQuestion(faq.question); setAnswer(faq.answer) }}
            className="text-ink-muted hover:text-ink text-sm font-medium px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg border border-line p-4 hover:border-brand-200 hover:shadow-card transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink text-sm">{faq.question}</p>
          <p className="text-ink-muted text-sm mt-1">{faq.answer}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {faq.category && (
              <span className="text-xs bg-surface-muted text-ink-muted px-2 py-0.5 rounded">{faq.category}</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${src.cls}`}>{src.label}</span>
            {faq.times_asked > 0 && (
              <span className="text-xs text-ink-muted">Asked {faq.times_asked}x</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-ink-muted hover:text-brand-700 p-1.5 rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {confirmDelete ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-red-600 hover:text-red-700 p-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-ink-muted hover:text-red-500 p-1.5 rounded transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AddFaqForm({
  programmeId,
  onAdd,
}: {
  programmeId: string
  onAdd: (programmeId: string, question: string, answer: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!question.trim() || !answer.trim()) return
    setSaving(true)
    await onAdd(programmeId, question, answer)
    setSaving(false)
    setQuestion('')
    setAnswer('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-brand-700 text-sm font-medium hover:underline"
      >
        + Add FAQ
      </button>
    )
  }

  return (
    <div className="bg-surface-muted rounded-lg p-4 border border-line">
      <label className="block text-xs font-medium text-ink-muted mb-1">Question</label>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g. What should my child wear?"
        className="input-field mb-3"
      />
      <label className="block text-xs font-medium text-ink-muted mb-1">Answer</label>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="Your answer..."
        className="input-field mb-3 resize-y"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !question.trim() || !answer.trim()}
          className="btn-primary text-sm px-3 py-1.5 min-h-0"
        >
          {saving ? 'Adding...' : 'Add FAQ'}
        </button>
        <button
          onClick={() => { setOpen(false); setQuestion(''); setAnswer('') }}
          className="text-ink-muted hover:text-ink text-sm font-medium px-3 py-1.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LearningPage() {
  const router = useRouter()
  const [pendingFaqs, setPendingFaqs] = useState<Faq[]>([])
  const [libraryFaqs, setLibraryFaqs] = useState<Faq[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState('')
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('all')

  /* ---------- data fetching ---------- */

  const fetchData = useCallback(async (cId: string) => {
    try {
      const [pendingRes, progsRes] = await Promise.all([
        fetch(`/api/faqs?coachId=${encodeURIComponent(cId)}`),
        fetch(`/api/programmes/list?coachId=${encodeURIComponent(cId)}`),
      ])

      let progs: Programme[] = []

      if (progsRes.ok) {
        const d = await progsRes.json()
        progs = d.programmes ?? d.programs ?? []
        setProgrammes(progs)
      }

      if (pendingRes.ok) {
        const d = await pendingRes.json()
        setPendingFaqs(d.faqs ?? d ?? [])
      }

      // Fetch active FAQs for each programme
      const allLibrary: Faq[] = []
      for (const prog of progs) {
        try {
          const res = await fetch(`/api/faqs?programmeId=${encodeURIComponent(prog.id)}&status=active`)
          if (res.ok) {
            const d = await res.json()
            const faqs: Faq[] = d.faqs ?? d ?? []
            allLibrary.push(...faqs.map((f) => ({ ...f, programme_name: f.programme_name || prog.programName })))
          }
        } catch {
          // skip individual programme errors
        }
      }
      setLibraryFaqs(allLibrary)
    } catch {
      // silently fail
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
    setCoachId(id)
    fetchData(id)
  }, [router, fetchData])

  /* ---------- handlers ---------- */

  async function handleApprove(faqId: string, answer: string) {
    try {
      const res = await fetch(`/api/faqs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: faqId, status: 'active', answer }),
      })
      if (res.ok) {
        const approved = pendingFaqs.find((f) => f.id === faqId)
        setPendingFaqs((prev) => prev.filter((f) => f.id !== faqId))
        if (approved) {
          setLibraryFaqs((prev) => [...prev, { ...approved, status: 'active', answer }])
        }
      }
    } catch {
      // silently fail
    }
  }

  async function handleCoachOnly(faqId: string) {
    try {
      const res = await fetch(`/api/faqs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: faqId, status: 'coach_only' }),
      })
      if (res.ok) {
        setPendingFaqs((prev) => prev.filter((f) => f.id !== faqId))
      }
    } catch {
      // silently fail
    }
  }

  async function handleUpdateFaq(faqId: string, question: string, answer: string) {
    try {
      const res = await fetch(`/api/faqs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: faqId, question, answer }),
      })
      if (res.ok) {
        setLibraryFaqs((prev) =>
          prev.map((f) => (f.id === faqId ? { ...f, question, answer } : f))
        )
      }
    } catch {
      // silently fail
    }
  }

  async function handleDeleteFaq(faqId: string) {
    try {
      const res = await fetch(`/api/faqs?id=${encodeURIComponent(faqId)}`, { method: 'DELETE' })
      if (res.ok) {
        setLibraryFaqs((prev) => prev.filter((f) => f.id !== faqId))
      }
    } catch {
      // silently fail
    }
  }

  async function handleAddFaq(programmeId: string, question: string, answer: string) {
    try {
      const res = await fetch(`/api/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, programmeId, question, answer, status: 'active', source: 'coach' }),
      })
      if (res.ok) {
        const d = await res.json()
        const prog = programmes.find((p) => p.id === programmeId)
        setLibraryFaqs((prev) => [
          ...prev,
          {
            id: d.id ?? d.faq?.id ?? crypto.randomUUID(),
            programme_id: programmeId,
            programme_name: prog?.programName || null,
            question,
            answer,
            category: null,
            source: 'coach',
            status: 'active',
            times_asked: 0,
          },
        ])
      }
    } catch {
      // silently fail
    }
  }

  /* ---------- derived ---------- */

  const filteredPending = selectedProgrammeId === 'all'
    ? pendingFaqs
    : pendingFaqs.filter((f) => f.programme_id === selectedProgrammeId)

  const filteredProgrammes = selectedProgrammeId === 'all'
    ? programmes
    : programmes.filter((p) => p.id === selectedProgrammeId)

  const faqsByProgramme = filteredProgrammes.map((prog) => ({
    programme: prog,
    faqs: libraryFaqs.filter((f) => f.programme_id === prog.id),
  }))

  /* ---------- loading ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3D8B37] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading learning log...</p>
        </div>
      </div>
    )
  }

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="px-4 py-6 md:px-8 lg:px-10 max-w-4xl mx-auto">

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
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Learning Log</h1>
          <p className="text-gray-500 text-sm mt-0.5">Review questions your bot couldn&apos;t answer and manage your FAQ library.</p>
        </div>

        {/* Programme filter tabs */}
        {programmes.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedProgrammeId('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedProgrammeId === 'all'
                  ? 'bg-[#3D8B37] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#3D8B37] hover:text-[#3D8B37]'
              }`}
            >
              All Programmes
            </button>
            {programmes.map((prog) => (
              <button
                key={prog.id}
                onClick={() => setSelectedProgrammeId(prog.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedProgrammeId === prog.id
                    ? 'bg-[#3D8B37] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#3D8B37] hover:text-[#3D8B37]'
                }`}
              >
                {prog.programName}
              </button>
            ))}
          </div>
        )}

        {/* ===== Section 1: Pending Review ===== */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Review</h2>
            {filteredPending.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {filteredPending.length} question{filteredPending.length !== 1 ? 's' : ''} awaiting your input
              </span>
            )}
          </div>

          {filteredPending.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-900 font-semibold mb-1">All caught up!</p>
              <p className="text-gray-500 text-sm">No questions pending review.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredPending.map((faq) => (
                <PendingCard
                  key={faq.id}
                  faq={faq}
                  onApprove={handleApprove}
                  onCoachOnly={handleCoachOnly}
                />
              ))}
            </div>
          )}
        </section>

        {/* ===== Section 2: FAQ Library ===== */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">FAQ Library</h2>

          {faqsByProgramme.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-gray-500 text-sm">No programmes found. Create a programme first to start building your FAQ library.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {faqsByProgramme.map(({ programme, faqs }) => (
                <div key={programme.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800">{programme.programName}</h3>
                    <span className="text-xs text-gray-400">{faqs.length} FAQ{faqs.length !== 1 ? 's' : ''}</span>
                  </div>

                  {faqs.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-100 p-6 text-center mb-3">
                      <p className="text-gray-400 text-sm">No FAQs for this programme yet.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-3">
                      {faqs.map((faq) => (
                        <FaqRow
                          key={faq.id}
                          faq={faq}
                          onUpdate={handleUpdateFaq}
                          onDelete={handleDeleteFaq}
                        />
                      ))}
                    </div>
                  )}

                  <AddFaqForm programmeId={programme.id} onAdd={handleAddFaq} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
