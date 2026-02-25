'use client'

import { useRef } from 'react'

interface Props {
  logoBase64: string | null
  onChange: (base64: string | null) => void
  label?: string
}

export default function LogoUpload({ logoBase64, onChange, label = 'Company Logo' }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, SVG, etc.)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Image is too large. Please use an image under 2MB for best performance.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result) {
        onChange(result)
      }
    }
    reader.readAsDataURL(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>

      {logoBase64 ? (
        <div className="flex items-start gap-4">
          <div className="w-24 h-16 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoBase64} alt="Logo preview" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 min-h-[36px]"
            >
              Change logo
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 min-h-[36px]"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
        >
          <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-500">Click to upload or drag and drop</p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG up to 2MB</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload logo"
      />
    </div>
  )
}
