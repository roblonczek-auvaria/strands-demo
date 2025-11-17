import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuthenticator } from '@aws-amplify/ui-react'
import './App.css'
import ModelSelect from './ModelSelect'
import { invokeAgent, createSessionId } from './api'
import type { KnowledgeBaseDocument, StructuredResponse } from './api'
import { TextWithCitations } from './TextWithCitations'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  structuredData?: StructuredResponse
  thinking?: string
  thinkingDone?: boolean
  thinkingCollapsed?: boolean
}

function extractAssistantSurface(text: string) {
  if (!text) {
    return { visible: '', thinking: '', open: false }
  }

  const visibleParts: string[] = []
  const thinkingParts: string[] = []
  const lower = text.toLowerCase()
  const openTag = '<thinking>'
  const closeTag = '</thinking>'
  const openLen = openTag.length
  const closeLen = closeTag.length
  let cursor = 0
  let stillOpen = false

  while (cursor < text.length) {
    const nextOpen = lower.indexOf(openTag, cursor)
    if (nextOpen === -1) {
      visibleParts.push(text.slice(cursor))
      break
    }

    visibleParts.push(text.slice(cursor, nextOpen))
    const start = nextOpen + openLen
    const nextClose = lower.indexOf(closeTag, start)
    if (nextClose === -1) {
      thinkingParts.push(text.slice(start))
      stillOpen = true
      break
    }
    thinkingParts.push(text.slice(start, nextClose))
    cursor = nextClose + closeLen
    stillOpen = false
  }

  const visible = visibleParts.join('')
    .replace(/<\/?thinking>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const thinking = thinkingParts
    .map(part => part.replace(/<\/?thinking>/gi, '').trim())
    .filter(Boolean)
    .join('\n\n')

  return {
    visible,
    thinking,
    open: stillOpen
  }
}

function cleanS3SourcePath(source: string): string {
  if (!source || typeof source !== 'string') {
    return source
  }
  
  // Match pattern: s3://bucket-name/path/to/file.ext
  // Extract only the URL path portion (www.auvaria.com/.../) without the filename
  const s3Pattern = /^s3:\/\/[^\/]+\/(.*?)([^\/]+\.[a-z]+)?$/i
  const match = source.match(s3Pattern)
  
  if (match && match[1]) {
    // match[1] contains the path after bucket name
    // Remove trailing filename if it exists and return just the directory path
    let cleanPath = match[1]
    // Ensure it ends with / for consistency
    if (!cleanPath.endsWith('/')) {
      cleanPath += '/'
    }
    return cleanPath
  }
  
  // If pattern doesn't match, return original
  return source
}

function extractCitationNumberFromDocument(doc: KnowledgeBaseDocument, fallbackIndex?: number): number | null {
  if (!doc) return null
  const candidateNumber = (doc as unknown as { citation_number?: unknown }).citation_number
  if (typeof candidateNumber === 'number' && Number.isFinite(candidateNumber)) {
    return candidateNumber
  }
  if (typeof doc.id === 'string') {
    const match = doc.id.match(/(\d+)(?!.*\d)/)
    if (match) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  if (typeof fallbackIndex === 'number') {
    return fallbackIndex + 1
  }
  return null
}

function escapeAttributeSelector(value: string): string {
  if (typeof window !== 'undefined' && typeof window.CSS !== 'undefined' && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

function ThinkingStream({
  text,
  done,
  collapsed,
  onToggle
}: {
  text: string
  done: boolean
  collapsed: boolean
  onToggle: () => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(true)
  const animationRef = useRef<number | null>(null)
  const hasText = text.trim().length > 0

  useLayoutEffect(() => {
    const node = scrollerRef.current
    if (!node) {
      setOverflowing(false)
      setAtTop(true)
      setAtBottom(true)
      return
    }
    node.scrollTop = 0
    const isOverflow = node.scrollHeight - node.clientHeight > 1
    setOverflowing(isOverflow)
    setAtTop(true)
    setAtBottom(!isOverflow)
  }, [text, collapsed])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const updateIndicators = () => {
      setAtTop(node.scrollTop <= 1)
      setAtBottom(node.scrollTop + node.clientHeight >= node.scrollHeight - 1)
    }
    updateIndicators()
    node.addEventListener('scroll', updateIndicators)
    return () => {
      node.removeEventListener('scroll', updateIndicators)
    }
  }, [text, collapsed, overflowing, done])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    if (done || !overflowing || collapsed) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      node.scrollTop = 0
      return
    }

    let direction = 1
    let previousTimestamp: number | null = null
    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight)
    const speed = 24

    const step = (timestamp: number) => {
      if (previousTimestamp == null) {
        previousTimestamp = timestamp
      }
      const deltaSeconds = (timestamp - previousTimestamp) / 1000
      previousTimestamp = timestamp
      node.scrollTop = Math.min(maxScroll, Math.max(0, node.scrollTop + direction * speed * deltaSeconds))
      if (node.scrollTop >= maxScroll - 0.5) {
        direction = -1
      } else if (node.scrollTop <= 0.5) {
        direction = 1
      }
      animationRef.current = requestAnimationFrame(step)
    }

    animationRef.current = requestAnimationFrame(step)
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [overflowing, collapsed, text, done])

  useEffect(() => {
    const handleResize = () => {
      const node = scrollerRef.current
      if (!node) return
      const isOverflow = node.scrollHeight - node.clientHeight > 1
      setOverflowing(isOverflow)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (done && collapsed && !hasText) {
    return null
  }

  if (collapsed) {
    return (
      <div className={`thinking-shell collapsed ${done ? 'done' : 'live'}`}>
        <button type="button" className="mini-btn thinking-toggle" onClick={onToggle}>
          {done ? 'Thoughts' : 'Thinking...'}
        </button>
      </div>
    )
  }

  const windowClassNames = [
    'thinking-window',
    overflowing ? 'overflowing' : '',
    overflowing && !atTop ? 'scrolled' : '',
    atBottom ? 'scrolled-bottom' : ''
  ].filter(Boolean).join(' ')

  return (
    <div className={`thinking-shell ${done ? 'done' : 'live'}`}>
      <div className="thinking-title">
        <span></span>
        <button type="button" className="mini-btn thinking-toggle" onClick={onToggle}>
          {done ? 'Hide thinking' : 'Hide thinking'}
        </button>
      </div>
      {hasText ? (
        <div ref={scrollerRef} className={windowClassNames}>
          <div className="thinking-text">{text}</div>
        </div>
      ) : (
        <div className={`thinking-placeholder ${done ? 'final' : ''}`}>
          {done ? 'No thinking shared.' : 'Model is thinking…'}
        </div>
      )}
    </div>
  )
}

function StructuredMessage({
  data,
  registerCitationHandler
}: {
  data: StructuredResponse
  registerCitationHandler: (handler: ((citationNumber: number) => void) | null) => void
}) {

  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [documentsVisible, setDocumentsVisible] = useState(false)
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(() => new Set())
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const panelId = useId()
  const panelLabelId = useId()

  const citationDocMap = useMemo(() => {
    const map = new Map<number, KnowledgeBaseDocument>()
    if (!Array.isArray(data.documents)) {
      return map
    }
    data.documents.forEach((doc, index) => {
      const citationNumber = extractCitationNumberFromDocument(doc, index)
      if (citationNumber != null && !map.has(citationNumber)) {
        map.set(citationNumber, doc)
      }
    })
    return map
  }, [data.documents])

  // Debug: log documents presence to help diagnose missing rendering
  useEffect(() => {
    if (data.documents) {
      console.debug('[StructuredMessage] documents count =', data.documents.length, data.documents)
    } else {
      console.debug('[StructuredMessage] no documents field present')
    }
  }, [data.documents])



  function toggleDocument(id: string) {
    setExpandedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const openDocuments = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setDocumentsVisible(true)
    requestAnimationFrame(() => setDocumentsOpen(true))
  }, [])

  const closeDocuments = useCallback(() => {
    setDocumentsOpen(false)
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      setDocumentsVisible(false)
      closeTimerRef.current = null
    }, 240)
  }, [])

  useEffect(() => {
    if (!documentsOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDocuments()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [documentsOpen, closeDocuments])

  useEffect(() => {
    if (!highlightedDocId) return
    const timeout = window.setTimeout(() => {
      setHighlightedDocId(null)
    }, 3500)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [highlightedDocId])

  useEffect(() => {
    if (!documentsOpen || !highlightedDocId) return
    const timer = window.setTimeout(() => {
      const selector = `[data-doc-id="${escapeAttributeSelector(highlightedDocId)}"]`
      const target = document.querySelector(selector)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 120)
    return () => {
      window.clearTimeout(timer)
    }
  }, [documentsOpen, highlightedDocId])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const handleCitationClick = useCallback((citationNumber: number) => {
    if (!data.documents || data.documents.length === 0) {
      // No documents available, just open the documents panel if possible
      return
    }

    const matchingDoc = citationDocMap.get(citationNumber)
    if (matchingDoc) {
      setExpandedDocIds(prev => {
        const next = new Set(prev)
        next.add(matchingDoc.id)
        return next
      })
      setHighlightedDocId(matchingDoc.id)
      openDocuments()
      return
    }

    if (data.documents && data.documents.length > 0) {
      openDocuments()
    }
  }, [citationDocMap, data.documents, openDocuments])

  useEffect(() => {
    registerCitationHandler(handleCitationClick)
    return () => {
      registerCitationHandler(null)
    }
  }, [handleCitationClick, registerCitationHandler])

  return (
    <div className="structured-response">
      <div className="answer-section">
        <TextWithCitations 
          text={data.answer || ''} 
          className="answer-text"
          onCitationClick={handleCitationClick}
          renderMarkdown
        />
      </div>

      {/* Minimal documents list (knowledge base retrievals) */}
      {data.documents && data.documents.length > 0 && (
        <>
          <div className="kb-documents">
            <button
              type="button"
              className={`kb-documents-header ${documentsOpen ? 'open' : ''}`}
              onClick={() => (documentsOpen ? closeDocuments() : openDocuments())}
              aria-expanded={documentsOpen}
              aria-controls={panelId}
            >
              <span
                className={`kb-documents-caret ${documentsOpen ? 'open' : ''}`}
                aria-hidden="true"
              />
              <span className="kb-documents-title">View Sources</span>
              <span className="kb-documents-count">({data.documents.length})</span>
            </button>
          </div>

          {documentsVisible && (
            <>
              <div
                className={`kb-panel-overlay ${documentsOpen ? 'open' : 'closing'}`}
                onClick={closeDocuments}
              />
              <aside
                className={`kb-panel ${documentsOpen ? 'open' : 'closing'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={panelLabelId}
                id={panelId}
              >
                <header className="kb-panel-header">
                  <div className="kb-panel-title-block">
                    <div className="kb-panel-title" id={panelLabelId}>Retrieved Documents</div>
                    <div className="kb-panel-subtitle">Results returned by the knowledge base</div>
                  </div>
                  <button type="button" className="mini-btn kb-panel-close" onClick={closeDocuments}>
                    Close
                  </button>
                </header>
                <div className="kb-panel-body">
                  <ul className="kb-documents-list">
                    {data.documents.map((doc, docIndex) => {
                      const fileName = doc.source.split('/').pop() || doc.source
                      const distance = typeof doc.distance === 'number' ? doc.distance.toFixed(3) : null
                      const content = typeof doc.content === 'string' ? doc.content : ''
                      const isExpanded = expandedDocIds.has(doc.id)
                      const docPanelId = `${panelId}-doc-${docIndex}`
                      const cardClassName = [
                        'kb-document-card',
                        isExpanded ? 'expanded' : '',
                        highlightedDocId === doc.id ? 'highlighted' : ''
                      ].filter(Boolean).join(' ')
                      return (
                        <li
                          key={doc.id}
                          className={cardClassName}
                          data-doc-id={doc.id}
                        >
                          <button
                            type="button"
                            className={`kb-document-toggle ${isExpanded ? 'open' : ''}`}
                            onClick={() => toggleDocument(doc.id)}
                            aria-expanded={isExpanded}
                            aria-controls={docPanelId}
                          >
                            <span className={`kb-document-toggle-caret ${isExpanded ? 'open' : ''}`} aria-hidden="true" />
                            <div className="kb-document-info">
                              <div className="kb-document-meta-row">
                                <code className="kb-document-id">
                                  {doc.id.replace(/^citation_(\d+)$/, 'Citation $1')}
                                </code>
                                {doc.page_number != null && (
                                  <span className="kb-document-meta">Page: {doc.page_number}</span>
                                )}
                                {distance && (
                                  <span className="kb-document-meta">Score: {(1 - parseFloat(distance)).toFixed(3)}</span>
                                )}
                              </div>
                              <strong className="kb-document-title">{fileName}</strong>
                            </div>
                          </button>
                          <div className={`kb-document-preview ${isExpanded ? 'expanded' : ''}`}>
                            {content}
                          </div>
                          {isExpanded && (
                            <div id={docPanelId} className="kb-document-details">
                              <div className="kb-document-meta-grid">
                                <div className="kb-document-meta-item">
                                  <span className="kb-document-meta-label">Source path</span>
                                  <span className="kb-document-meta-value">
                                    <a href={`https://${cleanS3SourcePath(doc.source)}`} target="_blank" rel="noreferrer">
                                      {cleanS3SourcePath(doc.source)}
                                    </a>
                                  </span>
                                </div>
                                <div className="kb-document-meta-item">
                                  <span className="kb-document-meta-label">Document ID</span>
                                  <span className="kb-document-meta-value">{doc.id}</span>
                                </div>
                                {doc.page_number != null && (
                                  <div className="kb-document-meta-item">
                                    <span className="kb-document-meta-label">Page</span>
                                    <span className="kb-document-meta-value">{doc.page_number}</span>
                                  </div>
                                )}
                                {distance && (
                                  <div className="kb-document-meta-item">
                                    <span className="kb-document-meta-label">Vector distance</span>
                                    <span className="kb-document-meta-value">{distance}</span>
                                  </div>
                                )}
                              </div>
                              {doc.related_uris && doc.related_uris.length > 0 && (
                                <div className="kb-document-related expanded">
                                  <div className="kb-document-meta-label">Related assets</div>
                                  <ul className="kb-document-links">
                                    {doc.related_uris.map(uri => (
                                      <li key={uri}>
                                        <a href={uri} target="_blank" rel="noopener noreferrer">{uri}</a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          {!isExpanded && doc.related_uris && doc.related_uris.length > 0 && (
                            <div className="kb-document-related">
                              Related assets: {doc.related_uris.length}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </aside>
            </>
          )}
        </>
      )}


    </div>
  )
}

function App() {
  const { user, signOut } = useAuthenticator((context) => [context.user])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sessionId, setSessionId] = useState(() => createSessionId())

  // Default immediately to Nova Pro so the selector renders that value before backend /api/models fetch.
  const [modelId, setModelId] = useState<string>('eu.amazon.nova-pro-v1:0')
  // Removed activeOnly toggle (no longer needed)
  const listEndRef = useRef<HTMLDivElement>(null)
  const inputBarRef = useRef<HTMLFormElement>(null)
  const streamBuffersRef = useRef<Map<string, { text: string; raf: number | null }>>(new Map()) // Buffers streaming chunks for smoother renders.
  const thinkingBuffersRef = useRef<Map<string, { text: string; raf: number | null }>>(new Map()) // Mirrors above for thinking traces.
  const globalCitationHandlerRef = useRef<((citationNumber: number) => void) | null>(null)

  const registerCitationHandler = useCallback((handler: ((citationNumber: number) => void) | null) => {
    globalCitationHandlerRef.current = handler
  }, [])

  const triggerCitationPanel = useCallback((citationNumber: number) => {
    if (globalCitationHandlerRef.current) {
      globalCitationHandlerRef.current(citationNumber)
      return
    }
    if (import.meta.env.DEV) {
      console.debug('Citation clicked with no registered handler:', citationNumber)
    }
  }, [])

  useEffect(() => {
    return () => {
      streamBuffersRef.current.forEach(entry => {
        if (entry.raf !== null) {
          cancelAnimationFrame(entry.raf)
        }
      })
      thinkingBuffersRef.current.forEach(entry => {
        if (entry.raf !== null) {
          cancelAnimationFrame(entry.raf)
        }
      })
    }
  }, [])





  // Initialize default model from backend once when app mounts.
  useEffect(() => {
    let cancelled = false
    async function initModel() {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        // Keep existing selection; optionally sync if backend default differs.
        if (typeof data.default_model === 'string' && data.default_model !== modelId) {
          // If you prefer to always enforce backend default, uncomment:
          // setModelId(data.default_model)
        }
      } catch {
        // ignore
      }
    }
    initModel()
    return () => { cancelled = true }
  }, [modelId])

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantId = crypto.randomUUID()
    setMessages((prev: Message[]) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        thinking: '',
        thinkingDone: false,
        thinkingCollapsed: true
      }
    ])
    setInput('')
    setLoading(true)
    streamBuffersRef.current.set(assistantId, { text: '', raf: null })
    thinkingBuffersRef.current.set(assistantId, { text: '', raf: null })

    try {
      const historyPayload = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role,
          content: m.structuredData?.answer ?? m.content
        }))

      const { reply, structuredData } = await invokeAgent({
        message: text,
        history: historyPayload,
        modelId: modelId || undefined,
        sessionId
      }, {
        onChunk: (chunk) => {
          if (!chunk) return
          const buffers = streamBuffersRef.current
          const entry = buffers.get(assistantId)
          if (!entry) return
          entry.text += chunk
          if (entry.raf !== null) return
          entry.raf = requestAnimationFrame(() => {
            const latest = buffers.get(assistantId)
            if (!latest) return
            const processed = extractAssistantSurface(latest.text)
            setMessages((prev: Message[]) => prev.map(msg => {
              if (msg.id !== assistantId) return msg
              return {
                ...msg,
                content: processed.visible,
                thinking: processed.thinking || msg.thinking || '',
                thinkingCollapsed: typeof msg.thinkingCollapsed === 'boolean' ? msg.thinkingCollapsed : true
              }
            }))
            latest.raf = null
          })
        },
        onThinking: ({ delta, replace, done }) => {
          const buffers = thinkingBuffersRef.current
          const entry = buffers.get(assistantId)
          if (!entry) return
          if (typeof replace === 'string') {
            entry.text = replace
          } else if (typeof delta === 'string') {
            entry.text += delta
          }

          const flush = () => {
            const latest = buffers.get(assistantId)
            if (!latest) return
            setMessages((prev: Message[]) => prev.map(msg => {
              if (msg.id !== assistantId) return msg
              return {
                ...msg,
                thinking: latest.text,
                thinkingDone: done ? true : msg.thinkingDone,
                thinkingCollapsed: typeof msg.thinkingCollapsed === 'boolean' ? msg.thinkingCollapsed : true
              }
            }))
            latest.raf = null
          }

          if (entry.raf === null) {
            entry.raf = requestAnimationFrame(flush)
          }

          if (done && entry.raf === null) {
            flush()
          }
        }
      })

      const displayContent = structuredData?.answer ?? reply
      const processedReply = extractAssistantSurface(reply)
      const finalVisible = structuredData ? displayContent : processedReply.visible
      const finalThinking = processedReply.thinking

      setMessages((prev: Message[]) => prev.map(msg => {
        if (msg.id !== assistantId) return msg
        return {
          ...msg,
          content: finalVisible,
          thinking: finalThinking || msg.thinking || '',
          structuredData,
          thinkingDone: true,
          thinkingCollapsed: true
        }
      }))
      const pending = streamBuffersRef.current.get(assistantId)
      if (pending?.raf != null) {
        cancelAnimationFrame(pending.raf)
      }
      streamBuffersRef.current.delete(assistantId)
      const thinkingPending = thinkingBuffersRef.current.get(assistantId)
      if (thinkingPending?.raf != null) {
        cancelAnimationFrame(thinkingPending.raf)
      }
      thinkingBuffersRef.current.delete(assistantId)
    } catch (err: any) {
      const errorMessage = err?.message || 'request failed'
      setMessages((prev: Message[]) => prev.map(msg => {
        if (msg.id !== assistantId) return msg
        return {
          ...msg,
          content: `Error: ${errorMessage}`,
          structuredData: undefined,
          thinkingDone: true
        }
      }))
      const pending = streamBuffersRef.current.get(assistantId)
      if (pending?.raf != null) {
        cancelAnimationFrame(pending.raf)
      }
      streamBuffersRef.current.delete(assistantId)
      const thinkingPending = thinkingBuffersRef.current.get(assistantId)
      if (thinkingPending?.raf != null) {
        cancelAnimationFrame(thinkingPending.raf)
      }
      thinkingBuffersRef.current.delete(assistantId)
    } finally {
      setLoading(false)
    }
  }

  async function resetConversation() {
    if (loading || resetting) return
    setResetting(true)
    try {
      if (import.meta.env.DEV) {
        await fetch('/api/reset', { method: 'POST' })
      }
    } catch (e) {
      // ignore error, still clear client state
    } finally {
      setMessages([])
      setInput('')
      setSessionId(createSessionId())
      setResetting(false)
    }
  }

  function toggleThinking(messageId: string) {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg
      return {
        ...msg,
        thinkingCollapsed: !msg.thinkingCollapsed
      }
    }))
  }

  return (
    <div className="app-shell">
      <div className="logo-watermark">
        <img src="/auvaria.svg" alt="" aria-hidden="true" />
      </div>
      <div className="header-shell">
        <div className="header">
          <h1 className="header-title">AgentCore RAG</h1>
          <div style={{marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center'}}>
            {user && (
              <span style={{fontSize:'13px', color:'var(--text-dim)', marginRight:'4px'}}>
                {user.signInDetails?.loginId || 'User'}
              </span>
            )}
            <button type="button" className="button subtle" disabled={loading || resetting} onClick={resetConversation}>
              {resetting ? 'Resetting…' : 'Reset Chat'}
            </button>
            <button type="button" className="button subtle" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="app-main">
        <div className="chat-area">
          <div className="chat-panel">
            {messages.map((m: Message) => {
              const isAssistant = m.role === 'assistant'
              const containerClass = isAssistant ? 'assistant-output' : 'bubble user'
              const contentText = typeof m.content === 'string' ? m.content : ''
              const showStreamingAnswer = isAssistant && !m.structuredData && !m.thinkingDone && contentText.trim().length > 0
              return (
                <div key={m.id} className={`msg-row ${m.role}`}>
                  <div className={containerClass}>
                    <div className="mini-role-tag">{isAssistant ? 'AI' : 'User'}</div>
                    {isAssistant && typeof m.thinking === 'string' ? (
                      <ThinkingStream
                        text={m.thinking}
                        done={Boolean(m.thinkingDone)}
                        collapsed={Boolean(m.thinkingCollapsed)}
                        onToggle={() => toggleThinking(m.id)}
                      />
                    ) : null}
                    {isAssistant ? (
                      m.structuredData ? (
                        <StructuredMessage 
                          data={m.structuredData} 
                          registerCitationHandler={registerCitationHandler}
                        />
                      ) : showStreamingAnswer ? (
                        <div className="structured-response">
                          <div className="answer-section">
                          <TextWithCitations
                              text={contentText}
                              className="answer-text"
                              renderMarkdown
                              onCitationClick={triggerCitationPanel}
                            />
                          </div>
                        </div>
                      ) : (
                        <TextWithCitations
                          text={m.content}
                          className="plain-text"
                          onCitationClick={triggerCitationPanel}
                        />
                      )
                    ) : (
                      <TextWithCitations
                        text={m.content}
                        className="plain-text"
                        onCitationClick={triggerCitationPanel}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          <div ref={listEndRef} className="chat-panel-end" />
        </div>

      </div>

      <div className="input-bar-container">
        <form
          ref={inputBarRef}
          onSubmit={sendMessage}
          className="input-bar"
          style={{flexWrap:'wrap', alignItems:'stretch'}}
        >
          <div style={{display:'flex', flex: '1 1 auto', gap:'8px', minWidth:'260px'}}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What do you want to ask about Auvaria?"
              disabled={loading}
              className="input"
              style={{flex:1}}
            />
            <div style={{maxWidth:'240px', flex:'0 0 auto'}}>
              <ModelSelect
                value={modelId}
                onChange={setModelId}
                disabled={loading}
                title="Choose foundation model"
              />
            </div>
            {/* Active only toggle removed */}
          </div>
          <button type="submit" disabled={loading || !input.trim()} className="button" style={{marginLeft:'auto'}}>
            {loading ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>

        <p className="helper" />
      </div>
    </div>
  )
}

export default App
