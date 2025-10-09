import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuthenticator } from '@aws-amplify/ui-react'
import './App.css'
import TopicSelect from './TopicSelect'
import { invokeAgent } from './api'
import type { StructuredResponse } from './api'

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

  if (done && collapsed) {
    return (
      <div className="thinking-shell collapsed">
        <button type="button" className="mini-btn thinking-toggle" onClick={onToggle}>
          Show thinking
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
        <span>Thinking</span>
        {done && (
          <button type="button" className="mini-btn thinking-toggle" onClick={onToggle}>
            Hide thinking
          </button>
        )}
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

function StructuredMessage({ data }: { data: StructuredResponse }) {
  const [showTrace, setShowTrace] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const rawJson = JSON.stringify(data, null, 2)

  function copyRaw() {
    navigator.clipboard.writeText(rawJson).catch(() => {})
  }

  return (
    <div className="structured-response">
      <div className="answer-section">
        <div className="answer-text">{data.answer}</div>
      </div>

      {data.sources && data.sources.length > 0 && (
        <div className="sources-section">
          <div className="sources-header">📚 Surse juridice:</div>
          <div className="sources-list">
            {data.sources.map((source, index) => (
              <div key={index} className="source-item">
                <span className="source-number">{index + 1}</span>
                <div className="source-details">
                  <div className="source-file">Document ID: {source.file_id}</div>
                  <div className="source-act">Act juridic ID: {source.id_act_baza}</div>
                  {source.articolul && (
                    <div className="source-articol">{source.articolul}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.search_trace || data.methodology || data.limitations) && (
        <div className="trace-panel">
          <div className="trace-header" onClick={() => setShowTrace(v => !v)}>
            <span>🔎 Retrieval trace & metodologie</span>
            <button className="mini-btn" type="button">{showTrace ? 'Ascunde' : 'Arată'}</button>
          </div>
          {showTrace && (
            <div className="trace-body">
              {data.search_trace && data.search_trace.length > 0 && (
                <div className="attempts">
                  {data.search_trace.map(a => (
                    <div key={a.attempt} className="attempt-card">
                      <div className="attempt-title">Încercarea {a.attempt}</div>
                      <div className="attempt-line"><strong>Interogare:</strong> <code>{a.query}</code></div>
                      <div className="attempt-line"><strong>Rezultate:</strong> {a.retrieved_count}</div>
                      {a.chosen_file_ids && (
                        <div className="attempt-line"><strong>Alese:</strong> {a.chosen_file_ids.join(', ')}</div>
                      )}
                      {a.reasoning && (
                        <div className="attempt-reasoning">{a.reasoning}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {data.methodology && (
                <div className="method-block">
                  <div className="block-label">Metodologie</div>
                  <div className="block-text">{data.methodology}</div>
                </div>
              )}
              {data.limitations && (
                <div className="method-block">
                  <div className="block-label">Limitări</div>
                  <div className="block-text">{data.limitations}</div>
                </div>
              )}
              <div className="raw-toggle">
                <button className="mini-btn" type="button" onClick={() => setShowRaw(r => !r)}>{showRaw ? 'Ascunde JSON' : 'JSON brut'}</button>
                {showRaw && (
                  <>
                    <button className="mini-btn" type="button" onClick={copyRaw}>Copiere</button>
                    <pre className="raw-json"><code>{rawJson}</code></pre>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
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
  const [topic, setTopic] = useState<string>('')
  const [activeOnly, setActiveOnly] = useState<boolean>(false)
  const listEndRef = useRef<HTMLDivElement>(null)
  const streamBuffersRef = useRef<Map<string, { text: string; raf: number | null }>>(new Map()) // Buffers streaming chunks for smoother renders.
  const thinkingBuffersRef = useRef<Map<string, { text: string; raf: number | null }>>(new Map()) // Mirrors above for thinking traces.

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

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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
        thinkingCollapsed: false
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
        topic: topic || undefined,
        activeOnly: activeOnly || undefined
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
                thinkingCollapsed: processed.thinking ? false : msg.thinkingCollapsed
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
                thinkingCollapsed: typeof msg.thinkingCollapsed === 'boolean' ? msg.thinkingCollapsed : false
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
          thinkingCollapsed: Boolean(finalThinking) ? false : msg.thinkingCollapsed
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
          structuredData: undefined
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
      await fetch('/api/reset', { method: 'POST' })
    } catch (e) {
      // ignore error, still clear client state
    } finally {
      setMessages([])
      setInput('')
      setResetting(false)
    }
  }

  function toggleThinking(messageId: string) {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId || !msg.thinkingDone) return msg
      return {
        ...msg,
        thinkingCollapsed: !msg.thinkingCollapsed
      }
    }))
  }

  return (
    <div className="app-shell">
      <div className="header">
        <h1 className="header-title">Strands RAG Agent</h1>
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

      <div className="chat-panel">
        {messages.map((m: Message) => (
          <div key={m.id} className={`msg-row ${m.role}`}>
            <div className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
              <div className="mini-role-tag">{m.role === 'user' ? 'User' : 'AI'}</div>
              {m.role === 'assistant' && typeof m.thinking === 'string'
                ? (
                  <ThinkingStream
                    text={m.thinking}
                    done={Boolean(m.thinkingDone)}
                    collapsed={Boolean(m.thinkingCollapsed)}
                    onToggle={() => toggleThinking(m.id)}
                  />
                )
                : null}
              {m.role === 'assistant' && m.structuredData ? (
                <StructuredMessage data={m.structuredData} />
              ) : (
                <div className="plain-text">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-bar" style={{flexWrap:'wrap', alignItems:'stretch'}}>
        <div style={{display:'flex', flex: '1 1 auto', gap:'8px', minWidth:'260px'}}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything about the ATP documentation"
            disabled={loading}
            className="input"
            style={{flex:1}}
          />
          <div style={{maxWidth:'280px', flex:'0 0 auto'}}>
            <TopicSelect
              value={topic}
              onChange={setTopic}
              disabled={loading}
              title="Choose a topic"
            />
          </div>
          <label className="recent-laws-switch" title="Limit results to recent / currently active laws">
            <input
              type="checkbox"
              checked={activeOnly}
              disabled={loading}
              onChange={e => setActiveOnly(e.target.checked)}
            />
            <span className="switch-pill" aria-hidden>
              <span className="thumb" />
            </span>
            <span className="rl-label">Active only</span>
          </label>
        </div>
        <button type="submit" disabled={loading || !input.trim()} className="button" style={{marginLeft:'auto'}}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </form>

  <p className="helper"></p>
    </div>
  )
}

export default App
