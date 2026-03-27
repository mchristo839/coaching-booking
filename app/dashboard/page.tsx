'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Program {
  id: string
  programName: string
  whatsappGroupId: string | null
  knowledgebase: Record<string, unknown> | null
  isActive: boolean
  createdAt: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [coachName, setCoachName] = useState('')
  const [coachId, setCoachId] = useState('')
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPrograms = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/programs/list?coachId=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (res.ok) setPrograms(data.programs || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    const name = localStorage.getItem('coachName')
    if (!id) { router.push('/auth/login'); return }
    setCoachId(id)
    setCoachName(name || 'Coach')
    fetchPrograms(id)
  }, [router, fetchPrograms])

  function handleLogout() {
    localStorage.removeItem('coachId')
    localStorage.removeItem('coachEmail')
    localStorage.removeItem('coachName')
    router.push('/')
  }

  const activeCount = programs.filter(p => p.whatsappGroupId && p.knowledgebase).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Welcome, {coachName}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeCount > 0
              ? `${activeCount} active WhatsApp bot${activeCount > 1 ? 's' : ''}`
              : 'No active bots yet — create a programme to get started'}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/settings"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors min-h-[44px]"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Programmes */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Your Programmes ({programs.length})
        </h2>
        <Link
          href="/dashboard/programs"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px] flex items-center"
        >
          + New Programme
        </Link>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-4">💬</p>
          <p className="text-lg font-semibold text-gray-900 mb-2">No programmes yet</p>
          <p className="text-gray-500 text-sm mb-6">
            Create a programme to set up your AI WhatsApp assistant.
          </p>
          <Link
            href="/dashboard/programs"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Create your first programme
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => {
            const hasKb = !!program.knowledgebase
            const hasGroup = !!program.whatsappGroupId
            const isLive = hasKb && hasGroup

            return (
              <div key={program.id} className="bg-white rounded-xl shadow-sm p-5 flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{program.programName}</h3>
                  {program.knowledgebase && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {(program.knowledgebase as Record<string, string>).sport} · {(program.knowledgebase as Record<string, string>).ageGroup} · {(program.knowledgebase as Record<string, string>).venue}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {isLive ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                        ● Bot live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
                        ⚠ Setup incomplete
                      </span>
                    )}
                    {!hasKb && (
                      <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">No knowledgebase</span>
                    )}
                    {!hasGroup && (
                      <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">No WhatsApp group linked</span>
                    )}
                  </div>
                </div>
                <Link
                  href="/dashboard/programs"
                  className="text-blue-600 text-sm hover:underline ml-4 whitespace-nowrap"
                >
                  Edit
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* Bot number reminder */}
      {programs.length > 0 && (
        <div className="mt-6 bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
          <strong>Bot number:</strong> +447458164754 — add this to your WhatsApp groups to activate the assistant.
        </div>
      )}
    </div>
  )
}
