export const IRDI_PATTERN = /^\d{4}-\d+#[A-Za-z0-9]{2}-[A-Za-z0-9]{6}#\d{3}$/

export function isValidIrdi(value: string): boolean {
  return IRDI_PATTERN.test(value.trim())
}

export function formatIrdi(raw: string): string {
  return raw.trim()
}

export function parseIrdiParts(irdi: string): {
  rai: string
  vi: string
  di: string
  dt: string
} | null {
  const match = irdi.match(/^(\d{4}-\d+)#([A-Za-z0-9]{2}-[A-Za-z0-9]{6})#(\d{3})$/)
  if (!match) return null
  const [, rai, di, dt] = match
  return { rai, vi: rai.split('-')[1], di, dt }
}
