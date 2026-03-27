'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CustomFaq {
  q: string
  a: string
}

interface Knowledgebase {
  sport: string
  venue: string
  venueAddress: string
  ageGroup: string
  skillLevel: string
  schedule: string
  priceCents: number
  whatToBring: string
  cancellationPolicy: string
  medicalInfo: string
  coachBio: string
  customFaqs: CustomFaq[]
}

interface Program {
  id: string
  programName: string
  whatsappGroupId: string | null
  isActive: boolean
  knowledgebase: Knowledgebase | null
  createdAt: string
}

const emptyKb = (): Knowledgebase => ({
  sport: '',
  venue: '',
  venueAddress: '',
  ageGroup: '',
  skillLevel: 'Beginner',
  schedule: '',
  priceCents: 0,
  whatToBring: '',
  cancellationPolicy: '',
  medicalInfo: '',
  coachBio: '',
  customFaqs: [],
})

type View = 'list' | 'create' | 'edit'

export default function ProgramsPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)

  // Form state
  const [programName, setProgramName] = useState('')
  const [kb, setKb] = useState<Knowledgebase>(emptyKb())
  const [whatsappGroupId, setWhatsappGroupId] = useState('')
  const [priceInput, setPriceInput] = useState('')

  const fetchPrograms = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/programs/list?coachId=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (res.ok) {
        setPrograms(
          (data.programs || []).map((p: Record<string, unknown>) => ({
            id: p.id,
            programName: p.programName,
            whatsappGroupId: p.whatsappGroupId || null,
            isActive: p.isActive,
            knowledgebase: p.knowledgebase || null,
            createdAt: p.createdAt,
          }))
        )
      }
    } catch {
      setError('Failed to load programs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
    setCoachId(id)
    fetchPrograms(id)
  }, [router, fetchPrograms])

  function openCreate() {
    setProgramName('')
    setKb(emptyKb())
    setPriceInput('')
    setWhatsappGroupId('')
    setEditingProgram(null)
    setError('')
    setSuccessMsg('')
    setView('create')
  }

  function openEdit(program: Program) {
    setProgramName(program.programName)
    setKb(program.knowledgebase || emptyKb())
    setPriceInput(program.knowledgebase ? String((program.knowledgebase.priceCents / 100).toFixed(2)) : '')
    setWhatsappGroupId(program.whatsappGroupId || '')
    setEditingProgram(program)
    setError('')
    setSuccessMsg('')
    setView('edit')
  }

  function updateKb<K extends keyof Knowledgebase>(field: K, value: Knowledgebase[K]) {
    setKb((prev) => ({ ...prev, [field]: value }))
  }

  function addFaq() {
    setKb((prev) => ({ ...prev, customFaqs: [...prev.customFaqs, { q: '', a: '' }] }))
  }

  function updateFaq(index: number, field: 'q' | 'a', value: string) {
    setKb((prev) => {
      const faqs = [...prev.customFaqs]
      faqs[index] = { ...faqs[index], [field]: value }
      return { ...prev, customFaqs: faqs }
    })
  }

  function removeFaq(index: number) {
    setKb((prev) => ({ ...prev, customFaqs: prev.customFaqs.filter((_, i) => i !== index) }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!coachId) return
    setSaving(true)
    setError('')

    const knowledgebase: Knowledgebase = {
      ...kb,
      priceCents: Math.round(parseFloat(priceInput || '0') * 100),
    }

    try {
      const res = await fetch('/api/programs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, programName, knowledgebase }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create program'); return }

      // Link WhatsApp group if provided
      if (whatsappGroupId.trim()) {
        await fetch('/api/programs/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId: data.programId, whatsappGroupId: whatsappGroupId.trim() }),
        })
      }

      setSuccessMsg(`"${programName}" created. Your WhatsApp bot is ready for this programme.`)
      setView('list')
      fetchPrograms(coachId)
    } catch {
      setError('Failed to create program')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingProgram) return
    setSaving(true)
    setError('')

    const knowledgebase: Knowledgebase = {
      ...kb,
      priceCents: Math.round(parseFloat(priceInput || '0') * 100),
    }

    try {
      const res = await fetch('/api/programs/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: editingProgram.id,
          programName,
          knowledgebase,
          whatsappGroupId: whatsappGroupId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to update program'); return }

      setSuccessMsg('Programme updated. The bot knowledgebase is live immediately.')
      setView('list')
      if (coachId) fetchPrograms(coachId)
    } catch {
      setError('Failed to update program')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading programmes...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Programmes</h1>
        </div>
        {view === 'list' && (
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            + New Programme
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{successMsg}</div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-4">
          {programs.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
              <p className="text-lg font-medium mb-2">No programmes yet</p>
              <p className="text-sm mb-4">Create a programme to get your WhatsApp bot up and running.</p>
              <button
                onClick={openCreate}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Create your first programme
              </button>
            </div>
          ) : (
            programs.map((program) => (
              <div key={program.id} className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{program.programName}</h3>
                    {program.knowledgebase && (
                      <p className="text-sm text-gray-500 mt-1">
                        {program.knowledgebase.sport} · {program.knowledgebase.ageGroup} · {program.knowledgebase.venue}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openEdit(program)}
                    className="text-blue-600 text-sm hover:underline ml-4"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {program.whatsappGroupId ? (
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                      ✓ WhatsApp linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
                      ⚠ No WhatsApp group linked
                    </span>
                  )}
                  {program.knowledgebase ? (
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                      ✓ Knowledgebase ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-1 rounded">
                      No knowledgebase
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / Edit form */}
      {(view === 'create' || view === 'edit') && (
        <form onSubmit={view === 'create' ? handleCreate : handleUpdate} className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {view === 'create' ? 'New Programme' : 'Edit Programme'}
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Programme Name *</label>
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                required
                placeholder="e.g. Football Mondays Under 12s"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sport / Activity *</label>
                <input
                  type="text"
                  value={kb.sport}
                  onChange={(e) => updateKb('sport', e.target.value)}
                  required
                  placeholder="e.g. Football, Swimming, Tennis"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Age Group *</label>
                <input
                  type="text"
                  value={kb.ageGroup}
                  onChange={(e) => updateKb('ageGroup', e.target.value)}
                  required
                  placeholder="e.g. Under 12s, Adults, Mixed"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                <input
                  type="text"
                  value={kb.venue}
                  onChange={(e) => updateKb('venue', e.target.value)}
                  required
                  placeholder="e.g. Victoria Park"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Address</label>
                <input
                  type="text"
                  value={kb.venueAddress}
                  onChange={(e) => updateKb('venueAddress', e.target.value)}
                  placeholder="e.g. Victoria Park, London E9 7BT"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
                <select
                  value={kb.skillLevel}
                  onChange={(e) => updateKb('skillLevel', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="All levels">All levels</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price per session (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="15.00"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Schedule *</label>
              <input
                type="text"
                value={kb.schedule}
                onChange={(e) => updateKb('schedule', e.target.value)}
                required
                placeholder="e.g. Every Monday 4:00pm–5:00pm"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">What to bring / wear</label>
              <textarea
                value={kb.whatToBring}
                onChange={(e) => updateKb('whatToBring', e.target.value)}
                rows={2}
                placeholder="e.g. Football boots, shin pads, water bottle, appropriate sports kit"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation policy</label>
              <textarea
                value={kb.cancellationPolicy}
                onChange={(e) => updateKb('cancellationPolicy', e.target.value)}
                rows={2}
                placeholder="e.g. 24 hours notice required for a full refund. No refund for no-shows."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Medical / injury info</label>
              <textarea
                value={kb.medicalInfo}
                onChange={(e) => updateKb('medicalInfo', e.target.value)}
                rows={2}
                placeholder="e.g. Please inform the coach of any injuries or medical conditions before the session."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">About the coach</label>
              <textarea
                value={kb.coachBio}
                onChange={(e) => updateKb('coachBio', e.target.value)}
                rows={2}
                placeholder="e.g. UEFA B licensed coach with 10 years of grassroots football experience."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>
          </div>

          {/* Custom FAQs */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Custom Q&amp;A</h2>
              <button
                type="button"
                onClick={addFaq}
                className="text-blue-600 text-sm hover:underline"
              >
                + Add question
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Add any specific questions parents often ask. The bot will use these answers.
            </p>
            {kb.customFaqs.length === 0 && (
              <p className="text-sm text-gray-400 italic">No custom Q&amp;A yet.</p>
            )}
            {kb.customFaqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-gray-500">Question {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeFaq(i)}
                    className="text-red-500 text-xs hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={faq.q}
                  onChange={(e) => updateFaq(i, 'q', e.target.value)}
                  placeholder="Question"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <textarea
                  value={faq.a}
                  onChange={(e) => updateFaq(i, 'a', e.target.value)}
                  placeholder="Answer"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
            ))}
          </div>

          {/* WhatsApp linking */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">WhatsApp Group</h2>
            <p className="text-sm text-gray-500">
              Add the bot (+447458164754) to your WhatsApp group, then paste the group ID here.
              The group ID looks like <code className="bg-gray-100 px-1 rounded text-xs">120363422695360945@g.us</code>.
              You can find it in the Evolution Manager or by sending a test message.
            </p>
            <input
              type="text"
              value={whatsappGroupId}
              onChange={(e) => setWhatsappGroupId(e.target.value)}
              placeholder="120363422695360945@g.us"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 font-mono text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving...' : view === 'create' ? 'Create Programme' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setView('list'); setError('') }}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
