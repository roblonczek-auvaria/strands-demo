import React, { useCallback, useEffect, useRef, useState } from 'react'

type Option = { value: string; label: string }

const OPTIONS: Option[] = [
  { value: '', label: 'Topic' },
  { value: 'GETTING_STARTED', label: 'Getting Started' },
  { value: 'API_REFERENCE', label: 'API Reference' },
  { value: 'BEST_PRACTICES', label: 'Best Practices' }
]

export interface TopicSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
}

export function TopicSelect({ value, onChange, disabled, title }: TopicSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const activeIndex = OPTIONS.findIndex(o => o.value === value)

  const close = useCallback(() => setOpen(false), [])

  // Outside click / escape handling
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

  // Keyboard navigation when open
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      const current = OPTIONS.findIndex(o => o.value === value)
      if (e.key === 'ArrowDown') {
        const next = (current + 1) % OPTIONS.length
        onChange(OPTIONS[next].value)
      } else if (e.key === 'ArrowUp') {
        const prev = (current - 1 + OPTIONS.length) % OPTIONS.length
        onChange(OPTIONS[prev].value)
      } else if (e.key === 'Enter' || e.key === ' ') {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, value, onChange, close])

  function toggle() {
    if (disabled) return
    setOpen(o => !o)
  }

  function selectOption(val: string) {
    onChange(val)
    close()
  }

  return (
    <div
      ref={rootRef}
      className={`topic-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
      data-disabled={disabled || undefined}
    >
      <button
        type="button"
        className="topic-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        disabled={disabled}
        title={title}
      >
        <span className={`topic-value ${value ? 'has' : 'placeholder'}`}>
          {OPTIONS.find(o => o.value === value)?.label || OPTIONS[0].label}
        </span>
        <span className="topic-caret" aria-hidden>▴</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="topic-menu"
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `topic-opt-${activeIndex}` : undefined}
        >
          {OPTIONS.map((opt, i) => {
            const active = opt.value === value
            return (
              <li
                id={`topic-opt-${i}`}
                key={opt.value || 'empty'}
                role="option"
                aria-selected={active}
                className={`topic-option ${active ? 'active' : ''}`}
                onClick={() => selectOption(opt.value)}
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

export default TopicSelect
