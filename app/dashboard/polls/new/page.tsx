'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
}

export default function NewPollPage() {
  const router = useRouter()
  const [authorisedProgrammes, setAuthorisedProgrammes] = useState<AuthorisedProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['Yes', 'No'])
  const [responseType, setResponseType] = useState<'single' | 'multiple'>('single')
  const [closesAt, setClosesAt] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sendMode, setSendMode] = useState<'all_groups' | 'selected_groups'>('all_groups')
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/auth/authorised-programmes', { credentials: 'include' })
      if (res.status === 401) { router.push('/auth/login'); return }
      const data = await res.json()
      setAuthorisedProgrammes(data.programmes || [])
      setLoading(false)
    }
    load()
  }, [router])

  function addOption() {
    if (options.length < 6) setOptions([...options, ''])
  }

  function removeOption(i: number) {
    if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
  }

  function toggleProgramme(id: string) {
    setSelectedProgrammeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
    if (!question.trim() || cleanOptions.length < 2) {
      setError('Question and at least 2 options required')
      setSaving(false)
      return
    }
    if (sendMode === 'selected_groups' && selectedProgrammeIds.length === 0) {
      setError('Select at least one programme')
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          options: cleanOptions,
          responseType,
          closesAt: closesAt || null,
          anonymous,
          sendMode,
          programmeIds: sendMode === 'selected_groups' ? selectedProgrammeIds : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send poll')
        return
      }
      router.push(`/dashboard/polls/${data.poll.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-gray-500 hover:text-gray-700 text-sm">← Control Centre</Link>
        <h1 className="text-2xl font-bold text-gray-900">New Poll</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question *</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              placeholder="e.g. Can your child make training on Saturday?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Options (2-6)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs text-gray-500 pt-3 w-6">{String.fromCharCode(97 + i)})</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-red-500 text-sm px-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-blue-600 text-sm hover:underline ml-8"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Closes at (optional)</label>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                Anonymous
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Send to</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={sendMode === 'all_groups'} onChange={() => setSendMode('all_groups')} />
            All my groups ({authorisedProgrammes.length})
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={sendMode === 'selected_groups'} onChange={() => setSendMode('selected_groups')} />
            Select groups
          </label>

          {sendMode === 'selected_groups' && (
            <div className="ml-6 space-y-2 border-l-2 border-gray-200 pl-4">
              {authorisedProgrammes.map((p) => (
                <label key={p.programme_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedProgrammeIds.includes(p.programme_id)}
                    onChange={() => toggleProgramme(p.programme_id)}
                  />
                  {p.programme_name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? 'Sending...' : 'Send poll'}
          </button>
          <Link href="/dashboard/control-centre" className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
