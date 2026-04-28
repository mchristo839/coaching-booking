// app/lib/use-vertical.ts
// Tiny client-side hook that returns the logged-in coach's vertical
// ('sport' | 'fitness') along with the matching label set.
//
// Strategy: read from localStorage first for instant render, then refresh
// from /api/auth/me in the background and update if it changed. Mirrors
// the pattern the rest of the dashboard already uses for coachId.

'use client'

import { useEffect, useState } from 'react'
import { labelsFor, type Vertical, type VerticalLabels } from './vertical-labels'

const STORAGE_KEY = 'coachVertical'

export function useVertical(): { vertical: Vertical; labels: VerticalLabels } {
  const [vertical, setVertical] = useState<Vertical>(() => {
    if (typeof window === 'undefined') return 'sport'
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'fitness' ? 'fitness' : 'sport'
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const next: Vertical = data.vertical === 'fitness' ? 'fitness' : 'sport'
        window.localStorage.setItem(STORAGE_KEY, next)
        setVertical((prev) => (prev === next ? prev : next))
      })
      .catch(() => {
        // Silent fail — fall back to whatever's already in storage.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { vertical, labels: labelsFor(vertical) }
}
