'use client'

import { useState } from 'react'

interface CustomFaq {
  q: string
  a: string
}

export interface Knowledgebase {
  sport: string
  venue: string
  venueAddress: string
  ageGroup: string
  skillLevel: string
  schedule: string
  sessionType: string
  campSchedule: string
  priceCents: number
  paymentMethod: string
  whatToBring: string
  cancellationPolicy: string
  medicalInfo: string
  coachBio: string
  customFaqs: CustomFaq[]
}

export const emptyKb = (): Knowledgebase => ({
  sport: '',
  venue: '',
  venueAddress: '',
  ageGroup: '',
  skillLevel: 'Beginner',
  schedule: '',
  sessionType: '',
  campSchedule: '',
  priceCents: 0,
  paymentMethod: '',
  whatToBring: '',
  cancellationPolicy: '',
  medicalInfo: '',
  coachBio: '',
  customFaqs: [],
})

// Programme row shape returned by /api/programmes/list — only the fields
// the form needs to round-trip. Everything else on the row is ignored here.
export interface ProgrammeRow {
  id: string
  programName?: string
  shortDescription?: string | null
  specificAgeGroup?: string | null
  skillLevel?: string | null
  sessionFrequency?: string | null
  venueName?: string | null
  venueAddress?: string | null
  sessionType?: string | null
  campSchedule?: string | null
  priceGbp?: number | string | null
  paymentMethod?: string | null
  whatToBring?: string | null
  cancellationNotice?: string | null
  botNotes?: string | null
  whatsappGroupId?: string | null
  isActive?: boolean
  createdAt?: string
  faqs?: Array<{ question: string; answer: string }>
}

// The `programmes` table has no dedicated columns for medical info or coach
// bio, so we pack them into `bot_notes` with tagged sections and parse them
// back on read. The tags are unusual enough to not collide with coach text.
const MEDICAL_TAG = '__MEDICAL__\n'
const BIO_TAG = '\n__BIO__\n'

function buildBotNotes(medical: string, bio: string): string | undefined {
  const m = medical.trim()
  const b = bio.trim()
  if (!m && !b) return undefined
  return `${MEDICAL_TAG}${m}${BIO_TAG}${b}`
}

function parseBotNotes(notes: string | null | undefined): { medical: string; bio: string } {
  if (!notes || !notes.startsWith(MEDICAL_TAG)) return { medical: '', bio: '' }
  const rest = notes.slice(MEDICAL_TAG.length)
  const idx = rest.indexOf(BIO_TAG)
  if (idx === -1) return { medical: rest.trim(), bio: '' }
  return {
    medical: rest.slice(0, idx).trim(),
    bio: rest.slice(idx + BIO_TAG.length).trim(),
  }
}

export function programmePayloadFromForm(
  programName: string,
  kb: Knowledgebase,
  whatsappGroupId: string
) {
  return {
    programmeName: programName,
    shortDescription: kb.sport || undefined,
    specificAgeGroup: kb.ageGroup || undefined,
    skillLevel: kb.skillLevel || undefined,
    sessionFrequency: kb.schedule || undefined,
    venueName: kb.venue || undefined,
    venueAddress: kb.venueAddress || undefined,
    sessionType: kb.sessionType || undefined,
    campSchedule: kb.campSchedule || undefined,
    priceGbp: kb.priceCents > 0 ? kb.priceCents / 100 : undefined,
    paymentMethod: kb.paymentMethod || undefined,
    whatToBring: kb.whatToBring || undefined,
    cancellationNotice: kb.cancellationPolicy || undefined,
    botNotes: buildBotNotes(kb.medicalInfo, kb.coachBio),
    whatsappGroupId: whatsappGroupId || undefined,
    faqs: kb.customFaqs
      .filter((f) => f.q.trim() && f.a.trim())
      .map((f) => ({ question: f.q.trim(), answer: f.a.trim() })),
  }
}

export function kbFromProgrammeRow(row: ProgrammeRow): Knowledgebase {
  const { medical, bio } = parseBotNotes(row.botNotes)
  return {
    sport: row.shortDescription || '',
    venue: row.venueName || '',
    venueAddress: row.venueAddress || '',
    ageGroup: row.specificAgeGroup || '',
    skillLevel: row.skillLevel || 'Beginner',
    schedule: row.sessionFrequency || '',
    sessionType: row.sessionType || '',
    campSchedule: row.campSchedule || '',
    priceCents: row.priceGbp ? Math.round(Number(row.priceGbp) * 100) : 0,
    paymentMethod: row.paymentMethod || '',
    whatToBring: row.whatToBring || '',
    cancellationPolicy: row.cancellationNotice || '',
    medicalInfo: medical,
    coachBio: bio,
    customFaqs: (row.faqs || []).map((f) => ({ q: f.question, a: f.answer })),
  }
}

interface ProgrammeFormProps {
  mode: 'create' | 'edit'
  initialName?: string
  initialKb?: Knowledgebase
  initialWhatsappGroupId?: string
  onSubmit: (data: {
    programName: string
    knowledgebase: Knowledgebase
    whatsappGroupId: string
  }) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export default function ProgrammeForm({
  mode,
  initialName = '',
  initialKb,
  initialWhatsappGroupId = '',
  onSubmit,
  onCancel,
  saving,
}: ProgrammeFormProps) {
  const [programName, setProgramName] = useState(initialName)
  const [kb, setKb] = useState<Knowledgebase>(initialKb || emptyKb())
  const [priceInput, setPriceInput] = useState(
    initialKb ? String((initialKb.priceCents / 100).toFixed(2)) : ''
  )
  const [whatsappGroupId, setWhatsappGroupId] = useState(initialWhatsappGroupId)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const knowledgebase: Knowledgebase = {
      ...kb,
      priceCents: Math.round(parseFloat(priceInput || '0') * 100),
    }
    await onSubmit({ programName, knowledgebase, whatsappGroupId: whatsappGroupId.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card shadow-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          {mode === 'create' ? 'New Programme' : 'Edit Programme'}
        </h2>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Programme Name *</label>
          <input
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            required
            placeholder="e.g. Football Mondays Under 12s"
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Sport / Activity *</label>
            <input
              type="text"
              value={kb.sport}
              onChange={(e) => updateKb('sport', e.target.value)}
              required
              placeholder="e.g. Football, Swimming, Tennis"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Age Group *</label>
            <input
              type="text"
              value={kb.ageGroup}
              onChange={(e) => updateKb('ageGroup', e.target.value)}
              required
              placeholder="e.g. Under 12s, Adults, Mixed"
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Venue Name *</label>
            <input
              type="text"
              value={kb.venue}
              onChange={(e) => updateKb('venue', e.target.value)}
              required
              placeholder="e.g. Victoria Park"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Venue Address</label>
            <input
              type="text"
              value={kb.venueAddress}
              onChange={(e) => updateKb('venueAddress', e.target.value)}
              placeholder="e.g. Victoria Park, London E9 7BT"
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Skill Level</label>
            <select
              value={kb.skillLevel}
              onChange={(e) => updateKb('skillLevel', e.target.value)}
              className="input-field"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="All levels">All levels</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Price per session ({'\u00A3'})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="15.00"
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Schedule *</label>
          <input
            type="text"
            value={kb.schedule}
            onChange={(e) => updateKb('schedule', e.target.value)}
            required
            placeholder="e.g. Every Monday 4:00pm-5:00pm"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">What is a session?</label>
          <textarea
            value={kb.sessionType}
            onChange={(e) => updateKb('sessionType', e.target.value)}
            rows={2}
            placeholder="e.g. A 45-minute small-group session: warm-up, skills drills, then a small-sided game."
            className="input-field"
          />
          <p className="text-xs text-ink-muted mt-1.5">The bot uses this to answer &ldquo;what kind of class is it?&rdquo;</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Holiday camps</label>
          <textarea
            value={kb.campSchedule}
            onChange={(e) => updateKb('campSchedule', e.target.value)}
            rows={2}
            placeholder="e.g. Feb half-term camp: Mon–Fri 17–21 Feb, 10am–2pm. Summer camps run weekly through August."
            className="input-field"
          />
          <p className="text-xs text-ink-muted mt-1.5">Leave blank if you don&rsquo;t run camps — the bot will check with you instead of guessing.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">How do parents pay?</label>
          <input
            type="text"
            value={kb.paymentMethod}
            onChange={(e) => updateKb('paymentMethod', e.target.value)}
            placeholder="e.g. Bank transfer on booking, or cash on the day"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">What to bring / wear</label>
          <textarea
            value={kb.whatToBring}
            onChange={(e) => updateKb('whatToBring', e.target.value)}
            rows={2}
            placeholder="e.g. Football boots, shin pads, water bottle, appropriate sports kit"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Cancellation policy</label>
          <textarea
            value={kb.cancellationPolicy}
            onChange={(e) => updateKb('cancellationPolicy', e.target.value)}
            rows={2}
            placeholder="e.g. 24 hours notice required for a full refund. No refund for no-shows."
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Medical / injury info</label>
          <textarea
            value={kb.medicalInfo}
            onChange={(e) => updateKb('medicalInfo', e.target.value)}
            rows={2}
            placeholder="e.g. Please inform the coach of any injuries or medical conditions before the session."
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">About the coach</label>
          <textarea
            value={kb.coachBio}
            onChange={(e) => updateKb('coachBio', e.target.value)}
            rows={2}
            placeholder="e.g. UEFA B licensed coach with 10 years of coaching experience."
            className="input-field"
          />
        </div>
      </div>

      {/* Custom FAQs */}
      <div className="card shadow-card space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-display text-lg font-semibold text-ink">Custom Q&amp;A</h2>
          <button
            type="button"
            onClick={addFaq}
            className="text-brand-700 text-sm font-medium hover:underline"
          >
            + Add question
          </button>
        </div>
        <p className="text-sm text-ink-muted">
          Add any specific questions parents often ask. The bot will use these answers.
        </p>
        {kb.customFaqs.length === 0 && (
          <p className="text-sm text-ink-muted italic">No custom Q&amp;A yet.</p>
        )}
        {kb.customFaqs.map((faq, i) => (
          <div key={i} className="border border-line rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-ink-muted">Question {i + 1}</span>
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
              className="input-field py-2 text-sm"
            />
            <textarea
              value={faq.a}
              onChange={(e) => updateFaq(i, 'a', e.target.value)}
              placeholder="Answer"
              rows={2}
              className="input-field py-2 text-sm"
            />
          </div>
        ))}
      </div>

      {/* WhatsApp linking */}
      <div className="card shadow-card space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">WhatsApp Group</h2>
        <p className="text-sm text-ink-muted">
          Add the bot number <strong>+447458164754</strong> to your WhatsApp group, then send any message in the group.
          The bot will reply with its group ID — copy and paste it here.
          It looks like <code className="bg-surface-muted px-1 rounded text-xs">120363422695360945@g.us</code>.
        </p>
        <input
          type="text"
          value={whatsappGroupId}
          onChange={(e) => setWhatsappGroupId(e.target.value)}
          placeholder="120363422695360945@g.us"
          className="input-field font-mono text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-8"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create Programme' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
