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
  priceCents: number
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
  priceCents: 0,
  whatToBring: '',
  cancellationPolicy: '',
  medicalInfo: '',
  coachBio: '',
  customFaqs: [],
})

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
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {mode === 'create' ? 'New Programme' : 'Edit Programme'}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Price per session ({'\u00A3'})</label>
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
            placeholder="e.g. Every Monday 4:00pm-5:00pm"
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
          Add the bot number <strong>+447458164754</strong> to your WhatsApp group, then send any message in the group.
          The bot will reply with its group ID — copy and paste it here.
          It looks like <code className="bg-gray-100 px-1 rounded text-xs">120363422695360945@g.us</code>.
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
          {saving ? 'Saving...' : mode === 'create' ? 'Create Programme' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
