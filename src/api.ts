import { fetchAuthSession } from 'aws-amplify/auth'

export type Source = {
  file_id: string
  id_act_baza: string
  articolul?: string
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
  answer: string
  sources: Source[]
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
  topic?: string
  activeOnly?: boolean
}

export type ChatResponse = {
  reply: string
  structuredData?: StructuredResponse
  raw: unknown
}

const AGENT_RUNTIME_ARN = import.meta.env.VITE_AGENT_RUNTIME_ARN
const AGENT_REGION = import.meta.env.VITE_BEDROCK_REGION || 'eu-central-1'

if (!AGENT_RUNTIME_ARN) {
  throw new Error('Missing VITE_AGENT_RUNTIME_ARN environment variable')
}

const encodedArn = encodeURIComponent(AGENT_RUNTIME_ARN)
const AGENT_ENDPOINT = `https://bedrock-agentcore.${AGENT_REGION}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`

function buildPayload(req: ChatRequest) {
  const payload: Record<string, unknown> = {
    prompt: req.message
  }

  const input: Record<string, unknown> = {}
  if (req.topic) input.topic = req.topic
  if (req.activeOnly) input.active_only = true
  if (Object.keys(input).length > 0) payload.input = input

  if (req.history && req.history.length > 0) {
    payload.history = req.history
  }

  return payload
}

export async function invokeAgent(req: ChatRequest): Promise<ChatResponse> {
  const session = await fetchAuthSession()
  const token = session.tokens?.accessToken?.toString()
  if (!token) throw new Error('Unable to acquire access token for AgentCore invocation')

  const randomComponent = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  let sessionId = `web_${randomComponent}_${Date.now()}`
  if (sessionId.length < 33) {
    sessionId = sessionId.padEnd(33, '0')
  }
  const res = await fetch(AGENT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId
    },
    body: JSON.stringify(buildPayload(req))
  })

  const rawBody = await res.text()
  if (!res.ok) {
    const message = rawBody || `HTTP ${res.status}`
    throw new Error(`Agent invocation failed: ${message}`)
  }

  let parsed: unknown
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    parsed = rawBody
  }

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
        if ('answer' in message) {
          reply = (message as any).answer ?? reply
          structuredData = normalizeStructuredResponse(message)
        } else {
          reply = JSON.stringify(message)
        }
      }
    } else if (typeof response === 'string') {
      reply = response
    } else if (response && typeof response === 'object') {
      if ('answer' in response) {
        reply = (response as any).answer ?? reply
  structuredData = normalizeStructuredResponse(response)
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
  return {
    answer: typeof candidate.answer === 'string' ? candidate.answer : 'No answer provided',
    sources: Array.isArray(candidate.sources) ? candidate.sources as Source[] : [],
    search_trace: Array.isArray(candidate.search_trace) ? candidate.search_trace as SearchTraceAttempt[] : undefined,
    methodology: typeof candidate.methodology === 'string' ? candidate.methodology : undefined,
    limitations: typeof candidate.limitations === 'string' ? candidate.limitations : undefined
  }
}
