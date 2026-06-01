'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProgrammeForm, {
  type Knowledgebase,
  type ProgrammeRow,
  kbFromProgrammeRow,
  programmePayloadFromForm,
} from '@/app/components/ProgrammeForm'

interface Program {
  id: string
  programName: string
  whatsappGroupId: string | null
  isActive: boolean
  knowledgebase: Knowledgebase
  createdAt: string
}

type View = 'list' | 'edit'

export default function ProgramsPage() {
  const router = useRouter()
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)

  const fetchPrograms = useCallback(async () => {
    try {
      const res = await fetch('/api/programmes/list?includeFaqs=true')
      const data = await res.json()
      if (res.ok) {
        setPrograms(
          (data.programmes || []).map((p: ProgrammeRow) => ({
            id: p.id,
            programName: p.programName || '',
            whatsappGroupId: p.whatsappGroupId || null,
            isActive: p.isActive ?? true,
            knowledgebase: kbFromProgrammeRow(p),
            createdAt: p.createdAt || '',
          }))
        )
      }
    } catch {
      setError('Failed to load programmes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
    fetchPrograms()
  }, [router, fetchPrograms])

  function openEdit(program: Program) {
    setEditingProgram(program)
    setError('')
    setSuccessMsg('')
    setView('edit')
  }

  async function handleUpdate(data: {
    programName: string
    knowledgebase: Knowledgebase
    whatsappGroupId: string
  }) {
    if (!editingProgram) return
    setSaving(true)
    setError('')

    try {
      // Update route ignores fields outside its fieldMap (including `faqs`).
      const fields = programmePayloadFromForm(
        data.programName,
        data.knowledgebase,
        data.whatsappGroupId
      )
      const res = await fetch('/api/programmes/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programmeId: editingProgram.id, ...fields }),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'Failed to update programme'); return }

      setSuccessMsg('Programme updated. The bot knowledgebase is live immediately.')
      setView('list')
      fetchPrograms()
    } catch {
      setError('Failed to update programme')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading programmes...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="reveal flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-ink-muted hover:text-ink transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-ink">Programmes</h1>
        </div>
        {view === 'list' && (
          <Link
            href="/dashboard/programmes/new"
            className="btn-primary text-sm"
          >
            + New Programme
          </Link>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}
      {successMsg && (
        <div className="bg-brand-50 text-brand-700 px-4 py-3 rounded-lg mb-4 text-sm border border-brand-100">{successMsg}</div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-4">
          {programs.length === 0 ? (
            <div className="card shadow-card p-8 text-center text-ink-muted">
              <p className="text-lg font-semibold text-ink mb-2">No programmes yet</p>
              <p className="text-sm mb-4">Create a programme to get your WhatsApp bot up and running.</p>
              <Link
                href="/dashboard/programmes/new"
                className="btn-primary text-sm"
              >
                Create your first programme
              </Link>
            </div>
          ) : (
            programs.map((program) => (
              <div key={program.id} className="card shadow-card transition-shadow hover:shadow-card-hover">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display font-semibold text-ink">{program.programName}</h3>
                    {program.knowledgebase && (
                      <p className="text-sm text-ink-muted mt-1">
                        {program.knowledgebase.sport} · {program.knowledgebase.ageGroup} · {program.knowledgebase.venue}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openEdit(program)}
                    className="text-brand-700 text-sm font-medium hover:underline ml-4"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {program.whatsappGroupId ? (
                    <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded">
                      WhatsApp linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded">
                      No WhatsApp group linked
                    </span>
                  )}
                  {program.knowledgebase ? (
                    <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded">
                      Knowledgebase ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-surface-muted text-ink-muted text-xs font-medium px-2 py-1 rounded">
                      No knowledgebase
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit form */}
      {view === 'edit' && editingProgram && (
        <ProgrammeForm
          mode="edit"
          initialName={editingProgram.programName}
          initialKb={editingProgram.knowledgebase}
          initialWhatsappGroupId={editingProgram.whatsappGroupId || ''}
          onSubmit={handleUpdate}
          onCancel={() => { setView('list'); setError('') }}
          saving={saving}
        />
      )}
    </div>
  )
}
