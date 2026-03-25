import { isValidIrdi, parseIrdiParts } from '@/lib/eclass/irdi'
import { searchEClass, findByIrdi } from '@/lib/eclass/search'

describe('IRDI validation', () => {
  it('accepts valid IRDIs', () => {
    expect(isValidIrdi('0173-1#02-AAO677#002')).toBe(true)
    expect(isValidIrdi('0173-1#02-AAB723#003')).toBe(true)
    expect(isValidIrdi('0173-1#02-ABG855#001')).toBe(true)
  })

  it('rejects invalid IRDIs', () => {
    expect(isValidIrdi('not-an-irdi')).toBe(false)
    expect(isValidIrdi('https://example.com')).toBe(false)
    expect(isValidIrdi('')).toBe(false)
    expect(isValidIrdi('0173-1#02-AAO677')).toBe(false)
    expect(isValidIrdi('173-1#02-AAO677#002')).toBe(false)
  })

  it('parses IRDI parts correctly', () => {
    const parts = parseIrdiParts('0173-1#02-AAO677#002')
    expect(parts).not.toBeNull()
    expect(parts!.rai).toBe('0173-1')
    expect(parts!.di).toBe('02-AAO677')
    expect(parts!.dt).toBe('002')
  })

  it('returns null for invalid IRDI', () => {
    expect(parseIrdiParts('invalid')).toBeNull()
  })
})

describe('eCLASS search', () => {
  it('returns empty array for empty query', () => {
    expect(searchEClass('')).toHaveLength(0)
  })

  it('finds manufacturer name property', () => {
    const results = searchEClass('manufacturer')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].property.preferredName.toLowerCase()).toContain('manufacturer')
  })

  it('returns results sorted by score descending', () => {
    const results = searchEClass('voltage')
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i-1].score)
    }
  })

  it('respects limit parameter', () => {
    const results = searchEClass('a', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('finds by exact IRDI', () => {
    const results = searchEClass('0173-1#02-AAO677#002')
    expect(results[0]?.property.irdi).toBe('0173-1#02-AAO677#002')
  })
})

describe('findByIrdi', () => {
  it('finds known property', () => {
    const prop = findByIrdi('0173-1#02-AAO677#002')
    expect(prop).toBeTruthy()
    expect(prop!.preferredName).toBe('Manufacturer name')
  })

  it('returns undefined for unknown IRDI', () => {
    expect(findByIrdi('0000-0#00-XXXXXX#000')).toBeUndefined()
  })

  it('trims whitespace before lookup', () => {
    const prop = findByIrdi('  0173-1#02-AAO677#002  ')
    expect(prop).toBeTruthy()
  })
})
