/**
 * Extracts text from a PDF file buffer using pdfjs-dist (Node.js server context).
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<{
  text: string
  pageCount: number
  pages: string[]
}> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // In Node.js we must point to the worker file explicitly
  const workerPath = new URL(
    '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url
  )
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath.href

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  }).promise

  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str ?? '')
      .filter((s: string) => s.trim().length > 0)
      .join(' ')
    pages.push(pageText)
  }

  const text = pages.join('\n\n')

  if (!text.trim()) {
    throw new Error('No extractable text found. The PDF may be scanned or image-only.')
  }

  return { text, pageCount: pdf.numPages, pages }
}
