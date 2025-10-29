import { fetchAuthSession } from 'aws-amplify/auth'

export type Source = {
  file_id: string
  id_act_baza: string
  articolul?: string
}

export type KnowledgeBaseDocument = {
  id: string
  distance: number
  source: string
  page_number: number
  related_uris: string[]
  content: string
}

export type SearchTraceAttempt = {
  attempt: number
  query: string
  retrieved_count: number
  retrieved_file_ids?: string[]
  chosen_file_ids?: string[]
  reasoning?: string
}

export type StructuredResponse = {
  answer?: string
  sources: Source[]
  documents?: KnowledgeBaseDocument[]  // Add the knowledge base documents
  search_trace?: SearchTraceAttempt[]
  methodology?: string
  limitations?: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = {
  message: string
  history?: ChatMessage[]
  modelId?: string
  sessionId?: string
}

export type ChatResponse = {
  reply: string
  structuredData?: StructuredResponse
  raw: unknown
}

export type InvokeAgentThinkingUpdate = {
  delta?: string
  replace?: string
  done?: boolean
}

export type InvokeAgentOptions = {
  onChunk?: (chunk: string) => void
  onThinking?: (update: InvokeAgentThinkingUpdate) => void
}
const AGENT_RUNTIME_ARN = import.meta.env.VITE_AGENT_RUNTIME_ARN
const AGENT_REGION = import.meta.env.VITE_BEDROCK_REGION || 'eu-central-1'

const encodedArn = AGENT_RUNTIME_ARN ? encodeURIComponent(AGENT_RUNTIME_ARN) : ''
const AGENT_ENDPOINT = AGENT_RUNTIME_ARN
  ? `https://bedrock-agentcore.${AGENT_REGION}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`
  : '/api/invocations?stream=true'

export function createSessionId() {
  const randomComponent = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  let sessionId = `web_${randomComponent}_${Date.now()}`
  if (sessionId.length < 33) {
    sessionId = sessionId.padEnd(33, '0')
  }
  return sessionId
}

function buildPayload(req: ChatRequest) {
  const payload: Record<string, unknown> = {
    prompt: req.message
  }

  const input: Record<string, unknown> = {}
  if (req.modelId) input.model_id = req.modelId
  if (req.sessionId) input.session_id = req.sessionId
  if (Object.keys(input).length > 0) payload.input = input

  if (req.modelId) {
    // Also support top-level for future compatibility (server accepts both)
    payload.model_id = req.modelId
  }
  if (req.sessionId) {
    payload.session_id = req.sessionId
  }

  if (req.history && req.history.length > 0) {
    payload.history = req.history
  }

  return payload
}

export async function invokeAgent(req: ChatRequest, options?: InvokeAgentOptions): Promise<ChatResponse> {
  const session = await fetchAuthSession()
  const token = session.tokens?.accessToken?.toString()
  if (!token) throw new Error('Unable to acquire access token for AgentCore invocation')

  const sessionId = req.sessionId ?? createSessionId()

  const endpoint = buildEndpoint()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
    Accept: options?.onChunk ? 'text/event-stream' : 'application/json'
  }

  // Build payload and explicitly request streaming when we expect chunks
  const basePayload = buildPayload(req)
  if (options?.onChunk) {
    ;(basePayload as any).stream = true
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(basePayload)
  })

  if (res.status === 404) {
    // Some endpoints do not support SSE yet; retry without streaming
    if (headers.Accept === 'text/event-stream') {
      const retryHeaders = { ...headers, Accept: 'application/json' }
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: retryHeaders,
        body: JSON.stringify(buildPayload(req))
      })
      const retryBody = await retryRes.text()
      if (!retryRes.ok) {
        throw new Error(retryBody || `HTTP ${retryRes.status}`)
      }
      const parsed = safeJsonParse(retryBody)
      return interpretParsedResponse(parsed)
    }
  }

  if (res.status === 400 && headers.Accept === 'text/event-stream') {
    const errorBody = await res.text()
    const retryHeaders = { ...headers, Accept: 'application/json' }
    const retryRes = await fetch(endpoint, {
      method: 'POST',
      headers: retryHeaders,
      body: JSON.stringify(buildPayload(req))
    })
    const retryBody = await retryRes.text()
    if (!retryRes.ok) {
      const message = retryBody || errorBody
      throw new Error(message || `HTTP ${retryRes.status}`)
    }
    const parsed = safeJsonParse(retryBody)
    return interpretParsedResponse(parsed)
  }

  const contentType = res.headers.get('content-type') || ''
  if (res.status >= 400) {
    const message = await res.text()
    throw new Error(message || `HTTP ${res.status}`)
  }

  if (options?.onChunk && contentType.includes('text/event-stream') && res.body) {
    try {
      return await consumeStreamResponse(res, options)
    } catch (e: any) {
      const msg = e?.message || ''
      // Fallback: if streaming ended prematurely, retry without SSE
      if (/response ended prematurely/i.test(msg) || /stream error/i.test(msg)) {
        const retryHeaders = { ...headers, Accept: 'application/json' }
        // Remove stream flag for retry
        const retryPayload = { ...basePayload }
        delete (retryPayload as any).stream
        const retryRes = await fetch(endpoint, {
          method: 'POST',
          headers: retryHeaders,
          body: JSON.stringify(retryPayload)
        })
        const retryBody = await retryRes.text()
        if (!retryRes.ok) {
          throw new Error(retryBody || msg || `HTTP ${retryRes.status}`)
        }
        const parsed = safeJsonParse(retryBody)
        return interpretParsedResponse(parsed)
      }
      throw e
    }
  }

  const rawBody = await res.text()
  const parsed = safeJsonParse(rawBody)
  return interpretParsedResponse(parsed)
}

function buildEndpoint(): string {
  return AGENT_ENDPOINT
}

async function consumeStreamResponse(res: Response, options: InvokeAgentOptions): Promise<ChatResponse> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let aggregated = ''
  let finalPayload: any
  let thinkingBuffer = ''
  let thinkingFinalized = false

  const notifyThinkingDone = (finalText?: string) => {
    if (thinkingFinalized) return
    if (finalText && finalText.trim().length > 0) {
      options.onThinking?.({ replace: finalText, done: true })
    } else {
      options.onThinking?.({ done: true })
    }
    thinkingFinalized = true
  }

  const consume = () => {
    let index: number
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 2)
      if (!rawEvent) continue
      const event = parseSseEvent(rawEvent)
      if (!event) continue
      if ('done' in event && event.done) {
        continue
      }
      if (event.type === 'thinking') {
        if (typeof event.content === 'string' && event.content) {
          thinkingBuffer += event.content
          options.onThinking?.({ delta: event.content })
        }
        continue
      }
      if (event.type === 'chunk' && typeof event.content === 'string') {
        aggregated += event.content
        options.onChunk?.(event.content)
      } else if (event.type === 'final') {
        finalPayload = event
      } else if (event.type === 'error') {
        notifyThinkingDone()
        throw new Error(event.message || 'Stream error')
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    consume()
  }

  if (buffer.trim().length > 0) {
    buffer += '\n\n'
    consume()
  }

  if (finalPayload) {
    const synthetic = {
      output: finalPayload.agentcore,
      response: finalPayload.response
    }
    const interpreted = interpretParsedResponse(synthetic)
    if (aggregated && (!interpreted.reply || interpreted.reply === 'No response')) {
      interpreted.reply = aggregated
    }
    interpreted.raw = finalPayload
    const finalThinking = extractThinking(finalPayload) ?? thinkingBuffer
    if (options.onThinking) {
      notifyThinkingDone(finalThinking)
    }
    return interpreted
  }

  if (aggregated) {
    if (options.onThinking) {
      notifyThinkingDone(thinkingBuffer)
    }
    return { reply: aggregated, structuredData: undefined, raw: aggregated }
  }

  if (options.onThinking) {
    notifyThinkingDone(thinkingBuffer)
  }
  return { reply: 'No response', structuredData: undefined, raw: null }
}

function parseSseEvent(segment: string): any {
  const lines = segment.split('\n')
  const dataLines = lines
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())

  if (dataLines.length === 0) {
    return null
  }

  const dataString = dataLines.join('\n')
  if (!dataString) {
    return null
  }

  if (dataString === '[DONE]') {
    return { done: true }
  }

  try {
    return JSON.parse(dataString)
  } catch {
    return { type: 'chunk', content: dataString }
  }
}

function safeJsonParse(text: string): unknown {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function interpretParsedResponse(parsed: unknown): ChatResponse {
  let reply = 'No response'
  let structuredData: StructuredResponse | undefined

  if (parsed && typeof parsed === 'object') {
    const output = (parsed as any).output
    const response = (parsed as any).response

    if (output && typeof output === 'object' && 'message' in output) {
      const message = (output as any).message
      if (typeof message === 'string') {
        reply = message
      } else if (message && typeof message === 'object') {
        const answerValue = (message as any).answer
        if (typeof answerValue === 'string' && answerValue.trim().length > 0) {
          reply = answerValue
          structuredData = normalizeStructuredResponse({ ...message, answer: answerValue })
        } else if ('raw' in message && typeof message.raw === 'string') {
          reply = message.raw
        } else if ('answer' in message) {
          // answer field present but empty; keep searching for better content
          const normalized = normalizeStructuredResponse(message)
          if (normalized.answer) {
            reply = normalized.answer
            structuredData = normalized
          }
        } else if ('raw' in message && typeof message.raw === 'string') {
          reply = message.raw
        } else {
          reply = JSON.stringify(message)
        }
      }
    } else if (typeof response === 'string') {
      reply = response
      try {
        const maybeJson = JSON.parse(response)
        if (maybeJson && typeof maybeJson === 'object' && 'answer' in maybeJson) {
          const normalized = normalizeStructuredResponse(maybeJson)
          if (normalized.answer) {
            structuredData = normalized
            reply = normalized.answer
          }
        }
      } catch {
        // ignore
      }
    } else if (response && typeof response === 'object') {
      const answerValue = (response as any).answer
      if (typeof answerValue === 'string' && answerValue.trim().length > 0) {
        reply = answerValue
        structuredData = normalizeStructuredResponse({ ...response, answer: answerValue })
      } else if ('answer' in response) {
        const normalized = normalizeStructuredResponse(response)
        if (normalized.answer) {
          reply = normalized.answer
          structuredData = normalized
        }
      } else {
        reply = JSON.stringify(response)
      }
    } else {
      reply = JSON.stringify(parsed)
    }
  } else if (typeof parsed === 'string') {
    reply = parsed
  }

  return { reply, structuredData, raw: parsed }
}

function normalizeStructuredResponse(data: unknown): StructuredResponse {
  const candidate = (data && typeof data === 'object') ? data as Record<string, unknown> : {}
  const answer = typeof candidate.answer === 'string' && candidate.answer.trim().length > 0
    ? candidate.answer
    : undefined
  return {
    answer,
    sources: Array.isArray(candidate.sources) ? candidate.sources as Source[] : [],
    documents: Array.isArray(candidate.documents) ? candidate.documents as KnowledgeBaseDocument[] : undefined,
    search_trace: Array.isArray(candidate.search_trace) ? candidate.search_trace as SearchTraceAttempt[] : undefined,
    methodology: typeof candidate.methodology === 'string' ? candidate.methodology : undefined,
    limitations: typeof candidate.limitations === 'string' ? candidate.limitations : undefined
  }
}

function extractThinking(finalPayload: any): string | undefined {
  if (!finalPayload || typeof finalPayload !== 'object') return undefined

  const candidates: unknown[] = [
    (finalPayload as any).thinking,
    (finalPayload as any).reasoning,
    finalPayload.agentcore?.thinking,
    finalPayload.agentcore?.reasoning,
    finalPayload.agentcore?.metadata?.thinking,
    finalPayload.agentcore?.metadata?.reasoning,
    finalPayload.agentcore?.output?.thinking,
    finalPayload.agentcore?.output?.reasoning,
    finalPayload.response?.thinking,
    finalPayload.response?.reasoning,
    finalPayload.response?.metadata?.thinking,
    finalPayload.response?.metadata?.reasoning
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }

  return undefined
}
