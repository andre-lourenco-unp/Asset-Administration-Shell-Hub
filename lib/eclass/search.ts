import { ECLASS_PROPERTIES } from './dataset'
import type { EClassProperty, EClassSearchResult } from './types'
import { isValidIrdi } from './irdi'

function scoreProperty(property: EClassProperty, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0

  let s = 0
  const name = property.preferredName.toLowerCase()
  const def = property.definition.toLowerCase()
  const irdi = property.irdi.toLowerCase()

  if (isValidIrdi(query) && irdi === q) return 100
  if (name.startsWith(q)) s += 60
  else if (name.includes(` ${q}`) || name.includes(`${q} `)) s += 40
  else if (name.includes(q)) s += 25
  if (def.includes(q)) s += 15
  if (property.unit?.toLowerCase().includes(q)) s += 10

  return Math.min(s, 99)
}

export function searchEClass(query: string, limit = 10): EClassSearchResult[] {
  if (!query.trim()) return []

  return ECLASS_PROPERTIES
    .map(property => ({ property, score: scoreProperty(property, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function findByIrdi(irdi: string): EClassProperty | undefined {
  return ECLASS_PROPERTIES.find(p => p.irdi === irdi.trim())
}
