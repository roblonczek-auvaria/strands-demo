import React, { useEffect, useRef, useState } from 'react'
import { useAuthenticator } from '@aws-amplify/ui-react'
import './App.css'
import TopicSelect from './TopicSelect'



type Source = {
  file_id: string
  id_act_baza: string
  articolul?: string
}

type SearchTraceAttempt = {
  attempt: number
  query: string
  retrieved_count: number
  retrieved_file_ids?: string[]
  chosen_file_ids?: string[]
  reasoning?: string
}

type StructuredResponse = {
  answer: string
  sources: Source[]
  search_trace?: SearchTraceAttempt[]
  methodology?: string
  limitations?: string
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  structuredData?: StructuredResponse
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

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev: Message[]) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/invocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, topic: topic || undefined, active_only: activeOnly || undefined })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { response?: string; error?: string }
      const reply = data.response ?? data.error ?? 'No response'
      
      // Try to parse structured JSON response
      let structuredData: StructuredResponse | undefined
      let displayContent = reply
      
      try {
        const parsed = JSON.parse(reply)
        if (parsed && typeof parsed === 'object' && parsed.answer) {
          // Accept even if sources array is empty or absent; default to []
          if (!Array.isArray(parsed.sources)) parsed.sources = []
          structuredData = parsed as StructuredResponse
          displayContent = parsed.answer
        }
      } catch {
        // Not JSON; treat as plain text
      }
      
      const botMsg: Message = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: displayContent,
        structuredData 
      }
      setMessages((prev: Message[]) => [...prev, botMsg])
    } catch (err: any) {
      const botMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err?.message ?? 'request failed'}` }
      setMessages((prev: Message[]) => [...prev, botMsg])
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

  return (
    <div className="app-shell">
      <div className="header">
        <h1 className="header-title">CTCE Legal Chat</h1>
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
              {m.role === 'assistant' && m.structuredData ? (
                <StructuredMessage data={m.structuredData} />
              ) : (
                <div className="plain-text">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg-row assistant">
            <div className="bubble ai">
              <div className="mini-role-tag">AI</div>
              <span className="typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
            </div>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-bar" style={{flexWrap:'wrap', alignItems:'stretch'}}>
        <div style={{display:'flex', flex: '1 1 auto', gap:'8px', minWidth:'260px'}}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about Romanian legal documents, treaties, or international agreements..."
            disabled={loading}
            className="input"
            style={{flex:1}}
          />
          <div style={{maxWidth:'280px', flex:'0 0 auto'}}>
            <TopicSelect
              value={topic}
              onChange={setTopic}
              disabled={loading}
              title="Selectează un topic pentru filtrare"
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
            <span className="rl-label">Recent Laws</span>
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
