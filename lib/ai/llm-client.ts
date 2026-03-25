/**
 * Multi-provider LLM client.
 * Auto-detects provider from key prefix:
 *   sk-ant-  → Anthropic (Claude)
 *   sk-      → OpenAI (GPT)
 *   AIzaSy   → Google Gemini
 *   xai-     → xAI (Grok)
 */

export type LLMProvider = 'anthropic' | 'openai' | 'gemini' | 'grok'

export function detectProvider(apiKey: string): LLMProvider {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  if (apiKey.startsWith('AIzaSy')) return 'gemini'
  if (apiKey.startsWith('xai-')) return 'grok'
  if (apiKey.startsWith('sk-')) return 'openai'
  // fallback: try anthropic
  return 'anthropic'
}

export function getEnvKey(): { key: string; provider: LLMProvider } | null {
  const anthropic = process.env.ANTHROPIC_API_KEY
  const openai = process.env.OPENAI_API_KEY
  const gemini = process.env.GEMINI_API_KEY
  const grok = process.env.GROK_API_KEY

  if (anthropic) return { key: anthropic, provider: 'anthropic' }
  if (openai) return { key: openai, provider: 'openai' }
  if (gemini) return { key: gemini, provider: 'gemini' }
  if (grok) return { key: grok, provider: 'grok' }
  return null
}

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || ''
    if (res.status === 401) throw new Error('Invalid Anthropic API key')
    if (msg.includes('credit')) throw new Error('Insufficient Anthropic credits. Add credits at console.anthropic.com → Plans & Billing.')
    throw new Error(`Anthropic API error ${res.status}: ${msg}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'text' },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || ''
    if (res.status === 401) throw new Error('Invalid OpenAI API key')
    if (res.status === 429) throw new Error('OpenAI rate limit or insufficient credits.')
    throw new Error(`OpenAI API error ${res.status}: ${msg}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const model = 'gemini-2.0-flash-lite'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || ''
    if (res.status === 400 && msg.includes('API key')) throw new Error('Invalid Gemini API key')
    throw new Error(`Gemini API error ${res.status}: ${msg}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callGrok(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || ''
    if (res.status === 401) throw new Error('Invalid Grok API key')
    throw new Error(`Grok API error ${res.status}: ${msg}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function callLLM(apiKey: string, prompt: string, provider?: LLMProvider): Promise<string> {
  const p = provider ?? detectProvider(apiKey)
  switch (p) {
    case 'anthropic': return callAnthropic(apiKey, prompt)
    case 'openai':    return callOpenAI(apiKey, prompt)
    case 'gemini':    return callGemini(apiKey, prompt)
    case 'grok':      return callGrok(apiKey, prompt)
  }
}
