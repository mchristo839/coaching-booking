'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Faq {
  id: string
  question: string
  answer: string
  category: string
  source: string
  status: string
  times_asked: number
  created_at: string
}

interface Programme {
  id: string
  programme_name: string
  short_description: string | null
  target_audience: string | null
  specific_age_group: string | null
  skill_level: string | null
  programme_type: string | null
  session_days: string[] | null
  session_start_time: string | null
  session_duration: string | null
  session_frequency: string | null
  holiday_schedule: string | null
  cancellation_notice: string | null
  venue_name: string | null
  venue_address: string | null
  parking: string | null
  nearest_transport: string | null
  indoor_outdoor: string | null
  bad_weather_policy: string | null
  max_capacity: number | null
  current_members: number | null
  full_threshold: string | null
  waitlist_enabled: boolean
  referral_trigger: string | null
  referral_incentive: string | null
  programme_status: string | null
  trial_available: string | null
  trial_instructions: string | null
  what_to_bring: string | null
  equipment_provided: string | null
  kit_required: string | null
  kit_details: string | null
  paid_or_free: string | null
  payment_model: string | null
  price_gbp: number | null
  price_includes: string | null
  sibling_discount: string | null
  refund_policy: string | null
  refund_details: string | null
  payment_methods: string[] | null
  payment_reminder_schedule: string | null
  bot_notes: string | null
  whatsapp_group_id: string | null
  is_active: boolean
  created_at: string
  member_count?: number
  waitlist_count?: number
  faqs?: Faq[]
}

interface FormData {
  programmeName: string
  shortDescription: string
  targetAudience: string
  specificAgeGroup: string
  skillLevel: string
  programmeType: string
  sessionDays: string[]
  sessionStartTime: string
  sessionDuration: string
  sessionFrequency: string
  holidaySchedule: string
  cancellationNotice: string
  venueName: string
  venueAddress: string
  parking: string
  nearestTransport: string
  indoorOutdoor: string
  badWeatherPolicy: string
  maxCapacity: string
  fullThreshold: string
  waitlistEnabled: boolean
  referralTrigger: string
  referralIncentive: string
  programmeStatus: string
  trialAvailable: string
  trialInstructions: string
  whatToBring: string
  equipmentProvided: string
  kitRequired: string
  kitDetails: string
  paidOrFree: string
  paymentModel: string
  priceGbp: string
  priceIncludes: string
  siblingDiscount: string
  refundPolicy: string
  refundDetails: string
  paymentMethods: string[]
  paymentReminderSchedule: string
  botNotes: string
  whatsappGroupId: string
}

type View = 'list' | 'create' | 'edit'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PAYMENT_METHOD_OPTIONS = ['Stripe', 'Cash', 'Bank transfer']

const emptyForm = (): FormData => ({
  programmeName: '',
  shortDescription: '',
  targetAudience: '',
  specificAgeGroup: '',
  skillLevel: '',
  programmeType: '',
  sessionDays: [],
  sessionStartTime: '',
  sessionDuration: '',
  sessionFrequency: '',
  holidaySchedule: '',
  cancellationNotice: '',
  venueName: '',
  venueAddress: '',
  parking: '',
  nearestTransport: '',
  indoorOutdoor: '',
  badWeatherPolicy: '',
  maxCapacity: '',
  fullThreshold: 'at_100',
  waitlistEnabled: true,
  referralTrigger: '',
  referralIncentive: '',
  programmeStatus: 'open',
  trialAvailable: '',
  trialInstructions: '',
  whatToBring: '',
  equipmentProvided: '',
  kitRequired: '',
  kitDetails: '',
  paidOrFree: 'paid',
  paymentModel: '',
  priceGbp: '',
  priceIncludes: '',
  siblingDiscount: '',
  refundPolicy: '',
  refundDetails: '',
  paymentMethods: [],
  paymentReminderSchedule: '',
  botNotes: '',
  whatsappGroupId: '',
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function capacityPercent(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.round((current / max) * 100), 100)
}

function capacityColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-[#3D8B37]'
}

function statusBadgeStyle(status: string | null): { label: string; cls: string } {
  const s = (status || 'open').toLowerCase()
  if (s.includes('full') && s.includes('waitlist')) return { label: 'Full - Waitlist', cls: 'bg-red-100 text-red-700' }
  if (s.includes('full') && s.includes('no')) return { label: 'Full - Closed', cls: 'bg-red-100 text-red-700' }
  if (s === 'full') return { label: 'Full', cls: 'bg-red-100 text-red-700' }
  if (s.includes('almost')) return { label: 'Almost Full', cls: 'bg-amber-100 text-amber-700' }
  if (s.includes('starting')) return { label: 'Starting Soon', cls: 'bg-blue-100 text-blue-700' }
  if (s.includes('not currently')) return { label: 'Not Running', cls: 'bg-gray-100 text-gray-600' }
  return { label: 'Open', cls: 'bg-green-100 text-green-700' }
}

function faqStatusBadge(status: string): { label: string; cls: string } {
  if (status === 'active') return { label: 'Active', cls: 'bg-green-100 text-green-700' }
  if (status === 'pending_coach_approval') return { label: 'Pending', cls: 'bg-amber-100 text-amber-700' }
  if (status === 'disabled') return { label: 'Disabled', cls: 'bg-gray-100 text-gray-500' }
  return { label: status, cls: 'bg-gray-100 text-gray-500' }
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function Section({
  title,
  defaultOpen,
  complete,
  children,
}: {
  title: string
  defaultOpen?: boolean
  complete?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {complete && (
            <svg className="w-5 h-5 text-[#3D8B37] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function ProgrammesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [coachId, setCoachId] = useState<string | null>(null)
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(null)

  // Form
  const [form, setForm] = useState<FormData>(emptyForm())
  // FAQs in form
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [newFaqQ, setNewFaqQ] = useState('')
  const [newFaqA, setNewFaqA] = useState('')
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null)
  const [editFaqQ, setEditFaqQ] = useState('')
  const [editFaqA, setEditFaqA] = useState('')
  // For create mode, store local FAQs not yet saved
  const [localFaqs, setLocalFaqs] = useState<{ question: string; answer: string }[]>([])

  /* ---------- Fetch ---------- */

  const fetchProgrammes = useCallback(async () => {
    try {
      const res = await fetch('/api/programmes/list?includeFaqs=true')
      if (res.status === 401) { router.push('/auth/login'); return }
      if (res.ok) {
        const data = await res.json()
        setProgrammes(data.programmes ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) {
      router.push('/auth/login')
      return
    }
    setCoachId(id)
    fetchProgrammes()
  }, [router, fetchProgrammes])

  // Handle ?edit=programmeId in URL
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && programmes.length > 0 && view === 'list') {
      const prog = programmes.find((p) => p.id === editId)
      if (prog) openEdit(prog)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, programmes])

  /* ---------- Form helpers ---------- */

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      sessionDays: prev.sessionDays.includes(day)
        ? prev.sessionDays.filter((d) => d !== day)
        : [...prev.sessionDays, day],
    }))
  }

  function togglePaymentMethod(method: string) {
    setForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }))
  }

  /* ---------- View transitions ---------- */

  function openCreate() {
    setForm(emptyForm())
    setFaqs([])
    setLocalFaqs([])
    setEditingProgramme(null)
    setError('')
    setSuccessMsg('')
    setView('create')
  }

  function openEdit(prog: Programme) {
    // Support both camelCase (from API) and snake_case (legacy) field names
    const p = prog as unknown as Record<string, unknown>
    const get = (camel: string, snake: string) => (p[camel] || p[snake] || '') as string
    const getArr = (camel: string, snake: string) => (p[camel] || p[snake] || []) as string[]
    const getBool = (camel: string, snake: string, fallback: boolean) => {
      if (p[camel] !== undefined) return p[camel] as boolean
      if (p[snake] !== undefined) return p[snake] as boolean
      return fallback
    }

    setForm({
      programmeName: get('programmeName', 'programme_name') || get('programName', 'program_name'),
      shortDescription: get('shortDescription', 'short_description'),
      targetAudience: get('targetAudience', 'target_audience'),
      specificAgeGroup: get('specificAgeGroup', 'specific_age_group'),
      skillLevel: get('skillLevel', 'skill_level'),
      programmeType: get('programmeType', 'programme_type'),
      sessionDays: getArr('sessionDays', 'session_days'),
      sessionStartTime: get('sessionStartTime', 'session_start_time'),
      sessionDuration: get('sessionDuration', 'session_duration'),
      sessionFrequency: get('sessionFrequency', 'session_frequency'),
      holidaySchedule: get('holidaySchedule', 'holiday_schedule'),
      cancellationNotice: get('cancellationNotice', 'cancellation_notice'),
      venueName: get('venueName', 'venue_name'),
      venueAddress: get('venueAddress', 'venue_address'),
      parking: get('parking', 'parking'),
      nearestTransport: get('nearestTransport', 'nearest_transport'),
      indoorOutdoor: get('indoorOutdoor', 'indoor_outdoor'),
      badWeatherPolicy: get('badWeatherPolicy', 'bad_weather_policy'),
      maxCapacity: (p.maxCapacity || p.max_capacity) ? String(p.maxCapacity || p.max_capacity) : '',
      fullThreshold: get('fullThreshold', 'full_threshold') || 'at_100',
      waitlistEnabled: getBool('waitlistEnabled', 'waitlist_enabled', true),
      referralTrigger: get('referralTrigger', 'referral_trigger'),
      referralIncentive: get('referralIncentive', 'referral_incentive'),
      programmeStatus: get('programmeStatus', 'programme_status') || 'open',
      trialAvailable: get('trialAvailable', 'trial_available'),
      trialInstructions: get('trialInstructions', 'trial_instructions'),
      whatToBring: get('whatToBring', 'what_to_bring'),
      equipmentProvided: get('equipmentProvided', 'equipment_provided'),
      kitRequired: get('kitRequired', 'kit_required'),
      kitDetails: get('kitDetails', 'kit_details'),
      paidOrFree: get('paidOrFree', 'paid_or_free') || 'paid',
      paymentModel: get('paymentModel', 'payment_model'),
      priceGbp: (p.priceGbp || p.price_gbp) ? String(p.priceGbp || p.price_gbp) : '',
      priceIncludes: get('priceIncludes', 'price_includes'),
      siblingDiscount: get('siblingDiscount', 'sibling_discount'),
      refundPolicy: get('refundPolicy', 'refund_policy'),
      refundDetails: get('refundDetails', 'refund_details'),
      paymentMethods: getArr('paymentMethods', 'payment_methods'),
      paymentReminderSchedule: get('paymentReminderSchedule', 'payment_reminder_schedule'),
      botNotes: get('botNotes', 'bot_notes'),
      whatsappGroupId: get('whatsappGroupId', 'whatsapp_group_id'),
    })
    setFaqs(prog.faqs || [])
    setLocalFaqs([])
    setEditingProgramme(prog)
    setEditingFaqId(null)
    setError('')
    setSuccessMsg('')
    setView('edit')
  }

  function goBackToList() {
    setView('list')
    setError('')
    setSuccessMsg('')
    // Clear ?edit= from URL
    router.replace('/dashboard/programmes', { scroll: false })
  }

  /* ---------- Section completeness ---------- */

  const sectionAComplete = !!form.programmeName
  const sectionBComplete = form.sessionDays.length > 0 && !!form.sessionStartTime
  const sectionCComplete = !!form.venueName && !!form.venueAddress
  const sectionDComplete = !!form.maxCapacity
  const sectionEComplete = !!form.whatToBring
  const sectionFComplete = form.paidOrFree === 'free' || (!!form.priceGbp && !!form.paymentModel)
  const sectionGComplete = (faqs.length > 0 || localFaqs.length > 0)

  /* ---------- FAQ handlers (edit mode) ---------- */

  async function addFaqToServer() {
    if (!editingProgramme || !newFaqQ.trim() || !newFaqA.trim()) return
    try {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId: editingProgramme.id,
          question: newFaqQ.trim(),
          answer: newFaqA.trim(),
          source: 'coach',
          status: 'active',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setFaqs((prev) => [...prev, data.faq])
        setNewFaqQ('')
        setNewFaqA('')
      }
    } catch {
      setError('Failed to add FAQ')
    }
  }

  async function saveFaqEdit(faqId: string) {
    try {
      const res = await fetch('/api/faqs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faqId, question: editFaqQ, answer: editFaqA }),
      })
      if (res.ok) {
        setFaqs((prev) =>
          prev.map((f) => (f.id === faqId ? { ...f, question: editFaqQ, answer: editFaqA } : f))
        )
        setEditingFaqId(null)
      }
    } catch {
      setError('Failed to update FAQ')
    }
  }

  async function deleteFaq(faqId: string) {
    try {
      await fetch('/api/faqs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faqId, status: 'disabled' }),
      })
      setFaqs((prev) => prev.filter((f) => f.id !== faqId))
    } catch {
      setError('Failed to delete FAQ')
    }
  }

  /* ---------- Create handler ---------- */

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!coachId) return
    if (!form.programmeName.trim()) {
      setError('Programme name is required')
      return
    }
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      programmeName: form.programmeName.trim(),
      shortDescription: form.shortDescription || undefined,
      targetAudience: form.targetAudience || undefined,
      specificAgeGroup: form.specificAgeGroup || undefined,
      skillLevel: form.skillLevel || undefined,
      programmeType: form.programmeType || undefined,
      sessionDays: form.sessionDays.length > 0 ? form.sessionDays : undefined,
      sessionStartTime: form.sessionStartTime || undefined,
      sessionDuration: form.sessionDuration || undefined,
      sessionFrequency: form.sessionFrequency || undefined,
      holidaySchedule: form.holidaySchedule || undefined,
      cancellationNotice: form.cancellationNotice || undefined,
      venueName: form.venueName || undefined,
      venueAddress: form.venueAddress || undefined,
      parking: form.parking || undefined,
      nearestTransport: form.nearestTransport || undefined,
      indoorOutdoor: form.indoorOutdoor || undefined,
      badWeatherPolicy: form.badWeatherPolicy || undefined,
      maxCapacity: form.maxCapacity ? parseInt(form.maxCapacity, 10) : undefined,
      fullThreshold: form.fullThreshold || undefined,
      waitlistEnabled: form.waitlistEnabled,
      referralTrigger: form.referralTrigger || undefined,
      referralIncentive: form.referralIncentive || undefined,
      programmeStatus: form.programmeStatus || 'open',
      trialAvailable: form.trialAvailable || undefined,
      trialInstructions: form.trialInstructions || undefined,
      whatToBring: form.whatToBring || undefined,
      equipmentProvided: form.equipmentProvided || undefined,
      kitRequired: form.kitRequired || undefined,
      kitDetails: form.kitDetails || undefined,
      paidOrFree: form.paidOrFree || undefined,
      paymentModel: form.paymentModel || undefined,
      priceGbp: form.priceGbp ? parseFloat(form.priceGbp) : undefined,
      priceIncludes: form.priceIncludes || undefined,
      siblingDiscount: form.siblingDiscount || undefined,
      refundPolicy: form.refundPolicy || undefined,
      refundDetails: form.refundDetails || undefined,
      paymentMethods: form.paymentMethods.length > 0 ? form.paymentMethods : undefined,
      paymentReminderSchedule: form.paymentReminderSchedule || undefined,
      botNotes: form.botNotes || undefined,
      whatsappGroupId: form.whatsappGroupId.trim() || undefined,
    }

    // Attach local FAQs
    if (localFaqs.length > 0) {
      body.faqs = localFaqs.map((f) => ({
        question: f.question,
        answer: f.answer,
        source: 'coach',
      }))
    }

    try {
      const res = await fetch('/api/programmes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create programme')
        return
      }
      setSuccessMsg(`"${form.programmeName}" created successfully. Your bot is ready.`)
      setView('list')
      fetchProgrammes()
    } catch {
      setError('Failed to create programme')
    } finally {
      setSaving(false)
    }
  }

  /* ---------- Update handler ---------- */

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingProgramme || !coachId) return
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      programmeId: editingProgramme.id,
      programmeName: form.programmeName.trim(),
      shortDescription: form.shortDescription,
      targetAudience: form.targetAudience,
      specificAgeGroup: form.specificAgeGroup,
      skillLevel: form.skillLevel,
      programmeType: form.programmeType,
      sessionDays: form.sessionDays,
      sessionStartTime: form.sessionStartTime,
      sessionDuration: form.sessionDuration,
      sessionFrequency: form.sessionFrequency,
      holidaySchedule: form.holidaySchedule,
      cancellationNotice: form.cancellationNotice,
      venueName: form.venueName,
      venueAddress: form.venueAddress,
      parking: form.parking,
      nearestTransport: form.nearestTransport,
      indoorOutdoor: form.indoorOutdoor,
      badWeatherPolicy: form.badWeatherPolicy,
      maxCapacity: form.maxCapacity ? parseInt(form.maxCapacity, 10) : null,
      fullThreshold: form.fullThreshold,
      waitlistEnabled: form.waitlistEnabled,
      referralTrigger: form.referralTrigger,
      referralIncentive: form.referralIncentive,
      programmeStatus: form.programmeStatus,
      trialAvailable: form.trialAvailable,
      trialInstructions: form.trialInstructions,
      whatToBring: form.whatToBring,
      equipmentProvided: form.equipmentProvided,
      kitRequired: form.kitRequired,
      kitDetails: form.kitDetails,
      paidOrFree: form.paidOrFree,
      paymentModel: form.paymentModel,
      priceGbp: form.priceGbp ? parseFloat(form.priceGbp) : null,
      priceIncludes: form.priceIncludes,
      siblingDiscount: form.siblingDiscount,
      refundPolicy: form.refundPolicy,
      refundDetails: form.refundDetails,
      paymentMethods: form.paymentMethods,
      paymentReminderSchedule: form.paymentReminderSchedule,
      botNotes: form.botNotes,
      whatsappGroupId: form.whatsappGroupId.trim() || null,
    }

    try {
      const res = await fetch('/api/programmes/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update programme')
        return
      }
      setSuccessMsg('Programme updated. Changes are live immediately.')
      setView('list')
      fetchProgrammes()
      router.replace('/dashboard/programmes', { scroll: false })
    } catch {
      setError('Failed to update programme')
    } finally {
      setSaving(false)
    }
  }

  /* ---------- Loading ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3D8B37] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading programmes...</p>
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  LIST VIEW                                                        */
  /* ================================================================ */

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 md:px-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Programmes</h1>
          </div>
          <button
            onClick={openCreate}
            className="bg-[#3D8B37] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#346E30] transition-colors min-h-[44px] shadow-sm"
          >
            + New Programme
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {successMsg && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{successMsg}</div>}

        {programmes.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-[#3D8B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-2">No programmes yet</p>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
              Create a programme, link a WhatsApp group, and your AI coaching assistant will be live in minutes.
            </p>
            <button
              onClick={openCreate}
              className="inline-flex items-center bg-[#3D8B37] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#346E30] transition-colors shadow-sm"
            >
              Create your first programme
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {programmes.map((prog) => {
              const p = prog as unknown as Record<string, unknown>
              const current = Number(p.memberCount ?? p.member_count ?? p.currentMembers ?? p.current_members ?? 0)
              const max = Number(p.maxCapacity ?? p.max_capacity ?? 0)
              const pct = capacityPercent(current, max)
              const badge = statusBadgeStyle((p.programmeStatus || p.programme_status || '') as string)
              const hasGroup = !!(p.whatsappGroupId || p.whatsapp_group_id)
              const name = (p.programmeName || p.programme_name || p.programName || 'Untitled') as string
              const desc = (p.shortDescription || p.short_description || '') as string

              return (
                <div key={prog.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
                  {/* Top row */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{name}</h3>
                      {desc && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{desc}</p>
                      )}
                    </div>
                    <button
                      onClick={() => openEdit(prog)}
                      className="text-[#3D8B37] text-sm font-medium hover:underline ml-3 whitespace-nowrap"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Sport / age badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {Boolean(p.skillLevel || p.skill_level) && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{String(p.skillLevel || p.skill_level)}</span>
                    )}
                    {Boolean(p.targetAudience || p.target_audience || p.specificAgeGroup || p.specific_age_group) && (
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                        {String(p.specificAgeGroup || p.specific_age_group || p.targetAudience || p.target_audience)}
                      </span>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {max > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{current} / {max} members</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${capacityColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bottom badges */}
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {hasGroup ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        WhatsApp linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
                        WhatsApp not linked
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ================================================================ */
  /*  CREATE / EDIT FORM                                               */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 md:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={goBackToList}
          className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {view === 'create' ? 'New Programme' : 'Edit Programme'}
        </h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

      <form onSubmit={view === 'create' ? handleCreate : handleUpdate} className="space-y-4">

        {/* ===== Section A: Age Group & Programme Info ===== */}
        <Section title="A - Programme Info" defaultOpen={true} complete={sectionAComplete}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programme Name *</label>
            <input
              type="text"
              value={form.programmeName}
              onChange={(e) => updateField('programmeName', e.target.value)}
              required
              placeholder="e.g. Saturday Football Academy Under 12s"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
            <textarea
              value={form.shortDescription}
              onChange={(e) => updateField('shortDescription', e.target.value)}
              rows={2}
              placeholder="2-3 sentences about this programme"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Who is this for?</label>
              <select
                value={form.targetAudience}
                onChange={(e) => updateField('targetAudience', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="under_18">Under 18s only</option>
                <option value="over_18">Over 18s only</option>
                <option value="both">Both</option>
              </select>
            </div>
            {(form.targetAudience === 'under_18' || form.targetAudience === 'both') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Specific Age Group</label>
                <select
                  value={form.specificAgeGroup}
                  onChange={(e) => updateField('specificAgeGroup', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                >
                  <option value="">Select...</option>
                  <option value="Under 5s">Under 5s</option>
                  <option value="Under 6s">Under 6s</option>
                  <option value="Under 7s">Under 7s</option>
                  <option value="Under 8s">Under 8s</option>
                  <option value="Under 9s">Under 9s</option>
                  <option value="Under 10s">Under 10s</option>
                  <option value="Under 11s">Under 11s</option>
                  <option value="Under 12s">Under 12s</option>
                  <option value="Under 13s">Under 13s</option>
                  <option value="Under 14s">Under 14s</option>
                  <option value="Under 15s">Under 15s</option>
                  <option value="Under 16s">Under 16s</option>
                  <option value="Under 17s">Under 17s</option>
                  <option value="Mixed juniors">Mixed juniors</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
            <select
              value={form.skillLevel}
              onChange={(e) => updateField('skillLevel', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            >
              <option value="">Select...</option>
              <option value="Complete beginners welcome">Complete beginners welcome</option>
              <option value="Some experience helpful">Some experience helpful</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced/competitive">Advanced/competitive</option>
              <option value="All levels welcome">All levels welcome</option>
            </select>
          </div>
        </Section>

        {/* ===== Section B: Schedule ===== */}
        <Section title="B - Schedule" complete={sectionBComplete}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programme Type</label>
            <select
              value={form.programmeType}
              onChange={(e) => updateField('programmeType', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            >
              <option value="">Select...</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Term-based">Term-based</option>
              <option value="Fixed period">Fixed period</option>
              <option value="Seasonal">Seasonal</option>
              <option value="Block">Block</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session Day(s)</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.sessionDays.includes(day)
                      ? 'bg-[#3D8B37] text-white border-[#3D8B37]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#3D8B37]'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Start Time</label>
              <input
                type="time"
                value={form.sessionStartTime}
                onChange={(e) => updateField('sessionStartTime', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration</label>
              <select
                value={form.sessionDuration}
                onChange={(e) => updateField('sessionDuration', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="30 mins">30 mins</option>
                <option value="45 mins">45 mins</option>
                <option value="60 mins">60 mins</option>
                <option value="75 mins">75 mins</option>
                <option value="90 mins">90 mins</option>
                <option value="2 hours">2 hours</option>
                <option value="2+ hours">2+ hours</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Frequency</label>
              <select
                value={form.sessionFrequency}
                onChange={(e) => updateField('sessionFrequency', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Once a week">Once a week</option>
                <option value="Twice a week">Twice a week</option>
                <option value="Three times a week">Three times a week</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Monthly">Monthly</option>
                <option value="Variable">Variable</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Schedule</label>
              <select
                value={form.holidaySchedule}
                onChange={(e) => updateField('holidaySchedule', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Sessions pause">Sessions pause during holidays</option>
                <option value="Reduced schedule">Reduced schedule</option>
                <option value="Continue as normal">Continue as normal</option>
                <option value="Holiday camps instead">Holiday camps instead</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Notes</label>
            <p className="text-xs text-gray-400 mb-1">Describe anything flexible about your schedule — e.g. &quot;Sundays vary depending on fixtures. Coach confirms each week via WhatsApp.&quot;</p>
            <textarea
              value={form.botNotes || ''}
              onChange={(e) => updateField('botNotes', e.target.value)}
              rows={3}
              placeholder="e.g. Training is every Wednesday 18:20-20:00. Sundays change weekly — sometimes a home match (14:00 KO), sometimes away, sometimes training at a different time. Coach will post the Sunday details in the group each week."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Notice Required</label>
            <select
              value={form.cancellationNotice}
              onChange={(e) => updateField('cancellationNotice', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            >
              <option value="">Select...</option>
              <option value="Same day">Same day</option>
              <option value="24 hours">24 hours</option>
              <option value="48 hours">48 hours</option>
              <option value="72 hours">72 hours</option>
              <option value="1 week">1 week</option>
            </select>
          </div>
        </Section>

        {/* ===== Section C: Venue ===== */}
        <Section title="C - Venue" complete={sectionCComplete}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
              <input
                type="text"
                value={form.venueName}
                onChange={(e) => updateField('venueName', e.target.value)}
                placeholder="e.g. Victoria Park"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parking</label>
              <select
                value={form.parking}
                onChange={(e) => updateField('parking', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Free on site">Free on site</option>
                <option value="Paid on site">Paid on site</option>
                <option value="Street parking">Street parking</option>
                <option value="No parking">No parking</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Address *</label>
            <textarea
              value={form.venueAddress}
              onChange={(e) => updateField('venueAddress', e.target.value)}
              rows={2}
              placeholder="Full venue address including postcode"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nearest Public Transport</label>
              <input
                type="text"
                value={form.nearestTransport}
                onChange={(e) => updateField('nearestTransport', e.target.value)}
                placeholder="e.g. Hackney Wick Overground"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Indoor or Outdoor</label>
              <select
                value={form.indoorOutdoor}
                onChange={(e) => updateField('indoorOutdoor', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Indoor">Indoor</option>
                <option value="Outdoor">Outdoor</option>
                <option value="Both">Both (indoor and outdoor)</option>
              </select>
            </div>
          </div>
          {(form.indoorOutdoor === 'Outdoor' || form.indoorOutdoor === 'Both') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bad Weather Policy</label>
              <select
                value={form.badWeatherPolicy}
                onChange={(e) => updateField('badWeatherPolicy', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Sessions go ahead">Sessions go ahead regardless</option>
                <option value="Cancelled if unsafe">Cancelled if unsafe</option>
                <option value="Moved indoors">Moved indoors</option>
                <option value="Decision morning of session">Decision made morning of session</option>
              </select>
            </div>
          )}
        </Section>

        {/* ===== Section D: Capacity & Availability ===== */}
        <Section title="D - Capacity & Availability" complete={sectionDComplete}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
              <input
                type="number"
                min="1"
                value={form.maxCapacity}
                onChange={(e) => updateField('maxCapacity', e.target.value)}
                placeholder="e.g. 20"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Threshold</label>
              <select
                value={form.fullThreshold}
                onChange={(e) => updateField('fullThreshold', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="at_100">At 100%</option>
                <option value="at_90">At 90%</option>
                <option value="at_80">At 80%</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Waitlist Enabled</label>
              <p className="text-xs text-gray-500">Allow people to join a waitlist when full</p>
            </div>
            <button
              type="button"
              onClick={() => updateField('waitlistEnabled', !form.waitlistEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.waitlistEnabled ? 'bg-[#3D8B37]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.waitlistEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Trigger</label>
              <select
                value={form.referralTrigger}
                onChange={(e) => updateField('referralTrigger', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Below 80%">Below 80% full</option>
                <option value="Below 70%">Below 70% full</option>
                <option value="Below 50%">Below 50% full</option>
                <option value="Any space">Any space available</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
            {form.referralTrigger && form.referralTrigger !== 'Manual' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referral Incentive</label>
                <input
                  type="text"
                  value={form.referralIncentive}
                  onChange={(e) => updateField('referralIncentive', e.target.value)}
                  placeholder="e.g. Free session for both"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Programme Status</label>
              <select
                value={form.programmeStatus}
                onChange={(e) => updateField('programmeStatus', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="open">Open</option>
                <option value="almost_full">Almost full</option>
                <option value="full_waitlist">Full - waitlist available</option>
                <option value="full_no_waitlist">Full - no waitlist</option>
                <option value="starting_soon">Starting soon</option>
                <option value="not_running">Not currently running</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trial Available</label>
              <select
                value={form.trialAvailable}
                onChange={(e) => updateField('trialAvailable', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Free trial">Free trial</option>
                <option value="Paid trial">Paid trial</option>
                <option value="No trial">No trial</option>
              </select>
            </div>
          </div>
          {(form.trialAvailable === 'Free trial' || form.trialAvailable === 'Paid trial') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trial Instructions</label>
              <input
                type="text"
                value={form.trialInstructions}
                onChange={(e) => updateField('trialInstructions', e.target.value)}
                placeholder="How to book a trial"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
          )}
        </Section>

        {/* ===== Section E: What to Bring ===== */}
        <Section title="E - What to Bring" complete={sectionEComplete}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What to Bring</label>
            <textarea
              value={form.whatToBring}
              onChange={(e) => updateField('whatToBring', e.target.value)}
              rows={3}
              placeholder="e.g. Football boots, shin pads, water bottle, appropriate sports kit"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Provided</label>
              <select
                value={form.equipmentProvided}
                onChange={(e) => updateField('equipmentProvided', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="All provided">All equipment provided</option>
                <option value="Some provided">Some equipment provided</option>
                <option value="None provided">No equipment provided</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kit / Uniform</label>
              <select
                value={form.kitRequired}
                onChange={(e) => updateField('kitRequired', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Required">Required</option>
                <option value="Recommended">Recommended</option>
                <option value="None">None needed</option>
              </select>
            </div>
          </div>
          {(form.kitRequired === 'Required' || form.kitRequired === 'Recommended') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kit Details</label>
              <input
                type="text"
                value={form.kitDetails}
                onChange={(e) => updateField('kitDetails', e.target.value)}
                placeholder="Where to buy, cost, colours etc."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
              />
            </div>
          )}
        </Section>

        {/* ===== Section F: Cost & Payment ===== */}
        <Section title="F - Cost & Payment" complete={sectionFComplete}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid or Free</label>
            <select
              value={form.paidOrFree}
              onChange={(e) => updateField('paidOrFree', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            >
              <option value="paid">Paid</option>
              <option value="free">Free</option>
              <option value="subsidised">Subsidised</option>
            </select>
          </div>
          {form.paidOrFree !== 'free' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Model</label>
                  <select
                    value={form.paymentModel}
                    onChange={(e) => updateField('paymentModel', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Termly">Termly</option>
                    <option value="Annual">Annual</option>
                    <option value="Per session">Per session</option>
                    <option value="Block booking">Block booking</option>
                    <option value="Season fee">Season fee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (GBP)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">&#163;</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.priceGbp}
                      onChange={(e) => updateField('priceGbp', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What does the price include?</label>
                <input
                  type="text"
                  value={form.priceIncludes}
                  onChange={(e) => updateField('priceIncludes', e.target.value)}
                  placeholder="e.g. Coaching, equipment hire, match fees"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sibling / Family Discount</label>
                <input
                  type="text"
                  value={form.siblingDiscount}
                  onChange={(e) => updateField('siblingDiscount', e.target.value)}
                  placeholder="e.g. 10% off for siblings"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refund Policy</label>
                  <select
                    value={form.refundPolicy}
                    onChange={(e) => updateField('refundPolicy', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="Full refund">Full refund</option>
                    <option value="Partial refund">Partial refund</option>
                    <option value="No refunds">No refunds</option>
                    <option value="Coach discretion">Coach discretion</option>
                  </select>
                </div>
                {(form.refundPolicy === 'Partial refund' || form.refundPolicy === 'Coach discretion') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Refund Details</label>
                    <input
                      type="text"
                      value={form.refundDetails}
                      onChange={(e) => updateField('refundDetails', e.target.value)}
                      placeholder="Explain refund conditions"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Methods</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => togglePaymentMethod(method)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.paymentMethods.includes(method)
                          ? 'bg-[#3D8B37] text-white border-[#3D8B37]'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-[#3D8B37]'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reminder Schedule</label>
                <select
                  value={form.paymentReminderSchedule}
                  onChange={(e) => updateField('paymentReminderSchedule', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
                >
                  <option value="">Select...</option>
                  <option value="3 days before">3 days before due</option>
                  <option value="7 days before">7 days before due</option>
                  <option value="On due date">On due date</option>
                  <option value="Day after">Day after due date</option>
                  <option value="Weekly until paid">Weekly until paid</option>
                </select>
              </div>
            </>
          )}
        </Section>

        {/* ===== Section G: FAQs & Bot Training ===== */}
        <Section title="G - FAQs & Bot Training" complete={sectionGComplete}>
          {/* Existing FAQs (edit mode) */}
          {view === 'edit' && faqs.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Existing FAQs ({faqs.length})</p>
              {faqs.map((faq) => {
                const fb = faqStatusBadge(faq.status)
                const isEditing = editingFaqId === faq.id

                if (isEditing) {
                  return (
                    <div key={faq.id} className="border border-[#3D8B37] rounded-lg p-4 space-y-2 bg-green-50/30">
                      <input
                        type="text"
                        value={editFaqQ}
                        onChange={(e) => setEditFaqQ(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        placeholder="Question"
                      />
                      <textarea
                        value={editFaqA}
                        onChange={(e) => setEditFaqA(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        placeholder="Answer"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveFaqEdit(faq.id)}
                          className="text-sm font-medium text-[#3D8B37] hover:underline"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFaqId(null)}
                          className="text-sm font-medium text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={faq.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{faq.question}</p>
                        <p className="text-sm text-gray-600 mt-1">{faq.answer}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${fb.cls}`}>
                        {fb.label}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFaqId(faq.id)
                          setEditFaqQ(faq.question)
                          setEditFaqA(faq.answer)
                        }}
                        className="text-xs font-medium text-[#3D8B37] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFaq(faq.id)}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                      {faq.times_asked > 0 && (
                        <span className="text-xs text-gray-400">Asked {faq.times_asked} times</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Local FAQs (create mode) */}
          {view === 'create' && localFaqs.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">FAQs to create ({localFaqs.length})</p>
              {localFaqs.map((faq, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900">{faq.question}</p>
                  <p className="text-sm text-gray-600 mt-1">{faq.answer}</p>
                  <button
                    type="button"
                    onClick={() => setLocalFaqs((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-xs font-medium text-red-500 hover:underline mt-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new FAQ */}
          <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Add a new FAQ</p>
            <input
              type="text"
              value={newFaqQ}
              onChange={(e) => setNewFaqQ(e.target.value)}
              placeholder="Question parents often ask"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
            <textarea
              value={newFaqA}
              onChange={(e) => setNewFaqA(e.target.value)}
              rows={2}
              placeholder="Your answer"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => {
                if (view === 'edit') {
                  addFaqToServer()
                } else {
                  if (newFaqQ.trim() && newFaqA.trim()) {
                    setLocalFaqs((prev) => [...prev, { question: newFaqQ.trim(), answer: newFaqA.trim() }])
                    setNewFaqQ('')
                    setNewFaqA('')
                  }
                }
              }}
              disabled={!newFaqQ.trim() || !newFaqA.trim()}
              className="bg-[#3D8B37] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#346E30] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add FAQ
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anything else the bot should know?
            </label>
            <textarea
              value={form.botNotes}
              onChange={(e) => updateField('botNotes', e.target.value)}
              rows={3}
              placeholder="Any extra context, rules, or instructions for the bot when answering questions about this programme"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
        </Section>

        {/* ===== WhatsApp Group Linking ===== */}
        <Section title="WhatsApp Group Linking" complete={!!form.whatsappGroupId}>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
            <p className="font-medium">How to link your WhatsApp group:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>
                Add the bot number <strong className="font-mono">+447458164754</strong> to your WhatsApp group
              </li>
              <li>Send any message in the group</li>
              <li>The bot will reply with the group ID</li>
              <li>Copy and paste it into the field below</li>
            </ol>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Group ID</label>
            <input
              type="text"
              value={form.whatsappGroupId}
              onChange={(e) => updateField('whatsappGroupId', e.target.value)}
              placeholder="e.g. 120363422695360945@g.us"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 font-mono text-sm focus:ring-2 focus:ring-[#3D8B37] focus:border-transparent"
            />
          </div>
        </Section>

        {/* ===== Actions ===== */}
        <div className="flex gap-3 pt-2 pb-8">
          <button
            type="submit"
            disabled={saving || !form.programmeName.trim()}
            className="bg-[#3D8B37] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#346E30] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] shadow-sm"
          >
            {saving ? 'Saving...' : view === 'create' ? 'Create Programme' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={goBackToList}
            className="bg-white text-gray-700 px-6 py-3 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function ProgrammesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <ProgrammesPageInner />
    </Suspense>
  )
}
