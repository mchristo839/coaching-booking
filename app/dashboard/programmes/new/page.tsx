'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProgrammeForm, {
  programmePayloadFromForm,
  type Knowledgebase,
} from '@/app/components/ProgrammeForm'

export default function NewProgrammePage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
    setCoachId(id)
  }, [router])

  async function handleSubmit(data: {
    programName: string
    knowledgebase: Knowledgebase
    whatsappGroupId: string
  }) {
    if (!coachId) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/programmes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          programmePayloadFromForm(data.programName, data.knowledgebase, data.whatsappGroupId)
        ),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'Failed to create programme'); return }

      router.push('/dashboard/programs')
    } catch {
      setError('Failed to create programme')
    } finally {
      setSaving(false)
    }
  }

  if (!coachId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/programs" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Programmes
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Programme</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      <ProgrammeForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={() => router.push('/dashboard/programs')}
        saving={saving}
      />
    </div>
  )
}
