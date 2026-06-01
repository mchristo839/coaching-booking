'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
  role: string
  whatsapp_group_id: string | null
}

export default function ControlCentrePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [programmes, setProgrammes] = useState<AuthorisedProgramme[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/auth/authorised-programmes', {
          credentials: 'include',
        })
        if (res.status === 401) {
          router.push('/auth/login')
          return
        }
        const data = await res.json()
        setProgrammes(data.programmes || [])
      } catch {
        setError('Failed to load authorised programmes')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    )
  }

  // Hide the Control Centre entirely if user has no authority over any programme
  if (programmes.length === 0) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">
            ← Dashboard
          </Link>
        </div>
        <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-lg border border-amber-100">
          You don&apos;t currently have authority over any programmes. Ask your
          coach owner or club GM to assign you before using the Control Centre.
        </div>
      </div>
    )
  }

  const actions = [
    {
      title: 'Create Promotion',
      description: 'Social event, refer-a-friend, holiday camp',
      href: '/dashboard/promotions/new',
      enabled: true,
    },
    {
      title: 'Launch Poll',
      description: 'Quick attendance check, availability, kit order',
      href: '/dashboard/polls/new',
      enabled: true,
    },
    {
      title: 'Publish Fixture',
      description: 'Match, friendly, cup, tournament',
      href: '/dashboard/fixtures/new',
      enabled: true,
    },
    {
      title: 'Cancel Session',
      description: 'Cancel a single training or fixture instance',
      href: '/dashboard/schedule',
      enabled: true,
    },
  ]

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">
          ← Dashboard
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Control Centre</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}

      <p className="text-ink-muted mb-6">
        Trigger outbound actions that the assistant will send to your group
        {programmes.length > 1 ? 's' : ''} on your behalf.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group block rounded-xl border border-line bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-card-hover"
          >
            <h3 className="font-display font-semibold text-lg text-ink group-hover:text-brand-700 transition-colors">{action.title}</h3>
            <p className="text-sm mt-1 text-ink-muted">{action.description}</p>
          </Link>
        ))}
      </div>

      <div className="card shadow-card">
        <h2 className="font-display font-semibold text-ink mb-3">
          Your authorised programmes ({programmes.length})
        </h2>
        <ul className="space-y-2">
          {programmes.map((p) => (
            <li
              key={p.programme_id}
              className="flex justify-between items-center text-sm"
            >
              <span className="text-ink">{p.programme_name}</span>
              <span className="text-xs bg-surface-muted text-ink-muted px-2 py-1 rounded">
                {p.role.replace('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
