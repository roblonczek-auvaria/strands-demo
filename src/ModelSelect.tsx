import React, { useCallback, useEffect, useRef, useState } from 'react'

export type ModelOption = { value: string; label: string; group?: string }

// Static fallback list (will be replaced by fetch to /api/models if available)
const FALLBACK_MODELS: ModelOption[] = [
  { value: 'eu.amazon.nova-2-lite-v1:0', label: 'Nova 2 Lite' },
  { value: 'eu.amazon.nova-pro-v1:0', label: 'Nova Pro' },
  { value: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5' },
  { value: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5' }
]

export interface ModelSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
}

export function ModelSelect({ value, onChange, disabled, title }: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const activeIndex = models.findIndex(m => m.value === value)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Fetch dynamic model list (served by backend /models or proxied via /api/models)
  useEffect(() => {
    let aborted = false
    async function load() {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        if (aborted) return
        if (Array.isArray(data.available_models)) {
          const mapped: ModelOption[] = data.available_models.map((id: string) => {
            if (id.includes('nova-lite')) return { value: id, label: 'Nova Lite' }
            if (id.includes('nova-pro')) return { value: id, label: 'Nova Pro' }
            if (id.includes('claude-sonnet-4-5')) return { value: id, label: 'Claude Sonnet 4.5' }
            if (id.includes('claude-sonnet-4-20250514')) return { value: id, label: 'Claude Sonnet 4 (May 2025)' }
            return { value: id, label: id }
          })
          setModels(mapped)
        }
        // Intentionally do NOT auto-set default here; App handles initial selection.
      } catch {
        // ignore fetch errors
      }
    }
    load()
    return () => { aborted = true }
  }, [])

  function toggle() {
    if (disabled) return
    setOpen(o => !o)
  }

  function selectModel(val: string) {
    onChange(val)
    close()
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      const current = models.findIndex(m => m.value === value)
      if (e.key === 'ArrowDown') {
        const next = (current + 1) % models.length
        onChange(models[next].value)
      } else if (e.key === 'ArrowUp') {
        const prev = (current - 1 + models.length) % models.length
        onChange(models[prev].value)
      } else if (e.key === 'Enter' || e.key === ' ') {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, models, value, onChange, close])

  const currentLabel = models.find(m => m.value === value)?.label || 'Model'

  // Reuse TopicSelect styling classes intentionally (topic-select, topic-trigger, etc.)
  return (
    <div ref={rootRef} className={`topic-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} data-disabled={disabled || undefined}>
      <button
        type="button"
        className="topic-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        disabled={disabled}
        title={title}
      >
        <span className={`topic-value ${value ? 'has' : 'placeholder'}`}>{currentLabel}</span>
        <span className="topic-caret" aria-hidden>▴</span>
      </button>
      {open && (
        <ul className="topic-menu" role="listbox" aria-activedescendant={activeIndex >= 0 ? `model-opt-${activeIndex}` : undefined}>
          {models.map((opt, i) => {
            const active = opt.value === value
            return (
              <li
                id={`model-opt-${i}`}
                key={opt.value}
                role="option"
                aria-selected={active}
                className={`topic-option ${active ? 'active' : ''}`}
                onClick={() => selectModel(opt.value)}
              >
                <span>{opt.label}</span>
                {active && <span className="check" aria-hidden>✓</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ModelSelect
