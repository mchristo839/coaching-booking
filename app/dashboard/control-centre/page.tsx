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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  // Hide the Control Centre entirely if user has no authority over any programme
  if (programmes.length === 0) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm">
            ← Dashboard
          </Link>
        </div>
        <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded-lg">
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
      colour: 'blue',
      enabled: true,
    },
    {
      title: 'Launch Poll',
      description: 'Quick attendance check, availability, kit order',
      href: '/dashboard/polls/new',
      colour: 'purple',
      enabled: true,
    },
    {
      title: 'Publish Fixture',
      description: 'Match, friendly, cup, tournament',
      href: '/dashboard/fixtures/new',
      colour: 'green',
      enabled: true,
    },
    {
      title: 'Cancel Session',
      description: 'Cancel a single training or fixture instance',
      href: '/dashboard/schedule',
      colour: 'red',
      enabled: true,
    },
  ]

  const colourClasses: Record<string, string> = {
    blue: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900',
    purple: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900',
    green: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-900',
    red: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-900',
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Control Centre</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      <p className="text-gray-600 mb-6">
        Trigger outbound actions that the assistant will send to your group
        {programmes.length > 1 ? 's' : ''} on your behalf.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className={`block border rounded-xl p-5 transition-colors ${colourClasses[action.colour]}`}
          >
            <h3 className="font-semibold text-lg">{action.title}</h3>
            <p className="text-sm mt-1 opacity-80">{action.description}</p>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">
          Your authorised programmes ({programmes.length})
        </h2>
        <ul className="space-y-2">
          {programmes.map((p) => (
            <li
              key={p.programme_id}
              className="flex justify-between items-center text-sm"
            >
              <span className="text-gray-900">{p.programme_name}</span>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                {p.role.replace('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
