import { isValidIdShort, isValidUri, normalizeValueType } from '@/lib/constants'

describe('Security and validation helpers', () => {
  describe('isValidIdShort', () => {
    it('accepts valid idShort', () => {
      expect(isValidIdShort('Motor')).toBe(true)
      expect(isValidIdShort('Motor1')).toBe(true)
      expect(isValidIdShort('My_Prop')).toBe(true)
    })
    it('rejects invalid idShort', () => {
      expect(isValidIdShort('1Motor')).toBe(false)
      expect(isValidIdShort('')).toBe(false)
    })
  })
  describe('isValidUri', () => {
    it('accepts valid URIs', () => {
      expect(isValidUri('https://admin-shell.io/aas/3/1')).toBe(true)
      expect(isValidUri('urn:example:aas')).toBe(true)
    })
    it('rejects invalid URIs', () => {
      expect(isValidUri('not-a-uri')).toBe(false)
      expect(isValidUri('')).toBe(false)
    })
  })
  describe('normalizeValueType', () => {
    it('normalizes xs:string variants', () => {
      expect(normalizeValueType('xs:string')).toBe('xs:string')
      expect(normalizeValueType('string')).toBe('xs:string')
    })
    it('returns undefined for unknown types', () => {
      expect(normalizeValueType('unknown')).toBeUndefined()
      expect(normalizeValueType(undefined)).toBeUndefined()
    })
  })
})
