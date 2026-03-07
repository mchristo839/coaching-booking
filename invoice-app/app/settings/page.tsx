'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/lib/storage'
import { SenderProfile, Currency, PaymentTerms } from '@/lib/types'
import LogoUpload from '@/app/components/LogoUpload'

const CURRENCIES: Currency[] = ['AUD', 'EUR', 'GBP', 'USD']
const CURRENCY_LABELS: Record<Currency, string> = {
  AUD: 'AUD - Australian Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  USD: 'USD - US Dollar',
}

type Tab = 'company' | 'personal' | 'preferences'

interface ProfileFormProps {
  type: 'company' | 'personal'
  profile: SenderProfile
  onUpdate: (updates: Partial<SenderProfile>) => void
}

function ProfileForm({ type, profile, onUpdate }: ProfileFormProps) {
  return (
    <div className="space-y-5">
      <LogoUpload
        logoBase64={profile.logoBase64}
        onChange={(base64) => onUpdate({ logoBase64: base64 })}
        label={type === 'company' ? 'Company Logo' : 'Personal Logo / Photo'}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {type === 'company' ? 'Company Name' : 'Your Name'} *
          </label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={type === 'company' ? 'Acme Pty Ltd' : 'Jane Smith'}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => onUpdate({ email: e.target.value })}
            placeholder="hello@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={profile.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            placeholder="+61 400 000 000"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {type === 'company' ? 'ABN / Tax Number' : 'Tax Number (optional)'}
          </label>
          <input
            type="text"
            value={profile.abn}
            onChange={(e) => onUpdate({ abn: e.target.value })}
            placeholder="12 345 678 901"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <textarea
          value={profile.address}
          onChange={(e) => onUpdate({ address: e.target.value })}
          rows={3}
          placeholder={`123 Main Street\nSydney NSW 2000\nAustralia`}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useSettings()
  const [activeTab, setActiveTab] = useState<Tab>('company')
  const [saved, setSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function updateProfile(type: 'company' | 'personal', updates: Partial<SenderProfile>) {
    setSettings({
      ...settings,
      senderProfiles: {
        ...settings.senderProfiles,
        [type]: { ...settings.senderProfiles[type], ...updates },
      },
    })
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!mounted) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-32" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'company', label: 'Company Profile' },
    { id: 'personal', label: 'Personal Profile' },
    { id: 'preferences', label: 'Preferences' },
  ]

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure your invoice sender profiles and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        {activeTab === 'company' && (
          <ProfileForm
            type="company"
            profile={settings.senderProfiles.company}
            onUpdate={(updates) => updateProfile('company', updates)}
          />
        )}
        {activeTab === 'personal' && (
          <ProfileForm
            type="personal"
            profile={settings.senderProfiles.personal}
            onUpdate={(updates) => updateProfile('personal', updates)}
          />
        )}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            {/* Tax rates */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Tax / GST Rates</h3>
              <p className="text-sm text-gray-500 mb-4">Default tax rate applied when creating invoices in each currency. You can override per invoice.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {CURRENCIES.map((currency) => (
                  <div key={currency}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{currency} Tax %</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={settings.taxRates[currency]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            taxRates: {
                              ...settings.taxRates,
                              [currency]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                            },
                          })
                        }
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                      />
                      <span className="absolute right-3 top-3.5 text-gray-400 text-sm">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Invoice Defaults</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                  <select
                    value={settings.defaultCurrency}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultCurrency: e.target.value as Currency })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Payment Terms</label>
                  <select
                    value={settings.defaultPaymentTerms}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultPaymentTerms: e.target.value as PaymentTerms })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="net7">Net 7 (7 days)</option>
                    <option value="net14">Net 14 (14 days)</option>
                    <option value="net30">Net 30 (30 days)</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Bank / Payment Details</h3>
              <p className="text-sm text-gray-500 mb-3">These details will be pre-filled in the payment notes section of new invoices.</p>
              <textarea
                value={settings.bankDetails}
                onChange={(e) => setSettings({ ...settings, bankDetails: e.target.value })}
                rows={5}
                placeholder={`Bank: National Australia Bank\nAccount Name: Your Name\nBSB: 083-001\nAccount Number: 12345678\n\nPlease include invoice number as reference.`}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm min-h-[44px] transition-colors"
        >
          Save Settings
        </button>
        {saved && (
          <span className="text-green-600 text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved!
          </span>
        )}
        <p className="text-xs text-gray-400 ml-auto">Changes auto-save as you type</p>
      </div>
    </div>
  )
}
