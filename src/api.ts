export type ChatRequest = {
  message: string
  history: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}

export type ChatResponse = {
  reply: string
}

export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
