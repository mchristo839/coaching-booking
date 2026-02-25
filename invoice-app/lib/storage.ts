'use client'

import { useState, useEffect, useCallback } from 'react'
import { Invoice, AppSettings, Currency, PaymentTerms } from './types'

const INVOICES_KEY = 'invoice-app:invoices'
const SETTINGS_KEY = 'invoice-app:settings'

function getDefaultSettings(): AppSettings {
  return {
    senderProfiles: {
      company: {
        type: 'company',
        name: '',
        email: '',
        phone: '',
        address: '',
        logoBase64: null,
        abn: '',
      },
      personal: {
        type: 'personal',
        name: '',
        email: '',
        phone: '',
        address: '',
        logoBase64: null,
        abn: '',
      },
    },
    taxRates: {
      AUD: 10,
      EUR: 19,
      GBP: 20,
      USD: 0,
    },
    defaultCurrency: 'AUD' as Currency,
    defaultPaymentTerms: 'net30' as PaymentTerms,
    nextInvoiceNumber: 1,
    bankDetails: '',
  }
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(defaultValue)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        setState(JSON.parse(stored))
      }
    } catch {
      // corrupted data, use default
    }
  }, [key])

  const setValue = useCallback(
    (value: T) => {
      setState(value)
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // localStorage full or unavailable
      }
    },
    [key]
  )

  return [state, setValue]
}

export function useInvoices(): [Invoice[], (invoices: Invoice[]) => void] {
  return useLocalStorage<Invoice[]>(INVOICES_KEY, [])
}

export function useSettings(): [AppSettings, (settings: AppSettings) => void] {
  const [settings, setSettings] = useLocalStorage<AppSettings>(
    SETTINGS_KEY,
    getDefaultSettings()
  )

  // Merge with defaults to handle schema upgrades
  const mergedSettings: AppSettings = {
    ...getDefaultSettings(),
    ...settings,
    senderProfiles: {
      company: { ...getDefaultSettings().senderProfiles.company, ...settings.senderProfiles?.company },
      personal: { ...getDefaultSettings().senderProfiles.personal, ...settings.senderProfiles?.personal },
    },
    taxRates: { ...getDefaultSettings().taxRates, ...settings.taxRates },
  }

  return [mergedSettings, setSettings]
}

export function getInvoicesFromStorage(): Invoice[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(INVOICES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveInvoicesToStorage(invoices: Invoice[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices))
  } catch {
    // localStorage full
  }
}
