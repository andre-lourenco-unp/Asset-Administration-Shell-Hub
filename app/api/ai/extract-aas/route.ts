import { NextRequest, NextResponse } from 'next/server'
import { buildAasExtractionPrompt } from '@/lib/ai/prompt-builder'
import { parseAiResponse } from '@/lib/ai/response-parser'
import { callLLM, detectProvider, getEnvKey } from '@/lib/ai/llm-client'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const idPrefix = (formData.get('idPrefix') as string) || 'urn:extracted'

    // Accept key from form (user-entered) or fall back to any env variable
    const formKey = formData.get('apiKey') as string | null
    const envEntry = getEnvKey()
    const apiKey = formKey?.trim() || envEntry?.key || null
    const provider = formKey?.trim() ? detectProvider(formKey.trim()) : envEntry?.provider

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!apiKey) return NextResponse.json({
      error: 'No API key provided. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROK_API_KEY to .env.local — or enter a key in the dialog.'
    }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    let pdfText: string

    try {
      const { extractPdfText } = await import('@/lib/ai/pdf-extractor')
      const result = await extractPdfText(buffer)
      pdfText = result.text
    } catch {
      return NextResponse.json({ error: 'Failed to extract text from PDF. Ensure it is a text-based PDF.' }, { status: 422 })
    }

    if (!pdfText.trim()) {
      return NextResponse.json({ error: 'PDF appears to be empty or scanned (no extractable text)' }, { status: 422 })
    }

    const prompt = buildAasExtractionPrompt(pdfText, idPrefix)
    const rawContent = await callLLM(apiKey, prompt, provider)
    const result = parseAiResponse(rawContent)

    return NextResponse.json({ result, provider })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Extraction failed' }, { status: 500 })
  }
}
