import { buildAasExtractionPrompt } from '@/lib/ai/prompt-builder'
import { parseAiResponse, extractionResultToSubmodels } from '@/lib/ai/response-parser'

const VALID_RESPONSE = JSON.stringify({
  assetIdShort: 'TestMotor',
  assetId: 'urn:test:TestMotor',
  assetDescription: 'A test motor',
  assetKind: 'Instance',
  submodels: [
    {
      idShort: 'TechnicalData',
      id: 'urn:test:TechnicalData',
      description: 'Technical specifications',
      elements: [
        { idShort: 'RatedVoltage', modelType: 'Property', valueType: 'xs:decimal', value: '400', unit: 'V', semanticIdIrdi: '0173-1#02-AAZ283#001', confidence: 95 },
        { idShort: 'Weight', modelType: 'Property', valueType: 'xs:decimal', value: '12.5', unit: 'kg', confidence: 70 },
        { idShort: 'Model', modelType: 'Property', valueType: 'xs:string', value: 'XY-400', confidence: 40 },
      ]
    }
  ]
})

describe('buildAasExtractionPrompt', () => {
  it('includes PDF text in prompt', () => {
    const prompt = buildAasExtractionPrompt('Test document content', 'urn:test')
    expect(prompt).toContain('Test document content')
    expect(prompt).toContain('urn:test')
  })

  it('includes AAS context', () => {
    const prompt = buildAasExtractionPrompt('test', 'urn:test')
    expect(prompt.toLowerCase()).toContain('asset administration shell')
  })

  it('truncates very long documents', () => {
    const longText = 'x'.repeat(20000)
    const prompt = buildAasExtractionPrompt(longText, 'urn:test')
    expect(prompt.length).toBeLessThan(16000)
  })
})

describe('parseAiResponse', () => {
  it('parses valid response', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    expect(result.assetIdShort).toBe('TestMotor')
    expect(result.submodels).toHaveLength(1)
    expect(result.submodels[0].elements).toHaveLength(3)
  })

  it('assigns correct confidence tiers', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    const els = result.submodels[0].elements
    expect(els.find(e => e.idShort === 'RatedVoltage')?.tier).toBe('high')
    expect(els.find(e => e.idShort === 'Weight')?.tier).toBe('medium')
    expect(els.find(e => e.idShort === 'Model')?.tier).toBe('low')
  })

  it('marks non-high confidence as needsReview', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    const els = result.submodels[0].elements
    expect(els.find(e => e.idShort === 'RatedVoltage')?.needsReview).toBe(false)
    expect(els.find(e => e.idShort === 'Weight')?.needsReview).toBe(true)
    expect(els.find(e => e.idShort === 'Model')?.needsReview).toBe(true)
  })

  it('extracts JSON from markdown code blocks', () => {
    const wrapped = '```json\n' + VALID_RESPONSE + '\n```'
    const result = parseAiResponse(wrapped)
    expect(result.assetIdShort).toBe('TestMotor')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAiResponse('not json')).toThrow()
  })

  it('throws on missing required fields', () => {
    expect(() => parseAiResponse(JSON.stringify({ submodels: [] }))).toThrow()
  })

  it('warns about and removes invalid IRDIs', () => {
    const withBadIrdi = JSON.stringify({
      assetIdShort: 'Test', assetId: 'urn:test', assetDescription: '', assetKind: 'Instance',
      submodels: [{ idShort: 'Data', id: 'urn:test:Data', description: '',
        elements: [{ idShort: 'Prop', modelType: 'Property', valueType: 'xs:string', value: '', semanticIdIrdi: 'invalid-irdi', confidence: 90 }]
      }]
    })
    const result = parseAiResponse(withBadIrdi)
    expect(result.warnings.some(w => w.includes('Invalid IRDI'))).toBe(true)
    expect(result.submodels[0].elements[0].semanticIdIrdi).toBeUndefined()
  })
})

describe('extractionResultToSubmodels', () => {
  it('converts to SubmodelInfo format', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    const submodels = extractionResultToSubmodels(result)
    expect(submodels).toHaveLength(1)
    expect(submodels[0].idShort).toBe('TechnicalData')
  })

  it('creates semanticId for elements with IRDI', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    const submodels = extractionResultToSubmodels(result)
    const voltage = submodels[0].submodelElements.find((e: any) => e.idShort === 'RatedVoltage')
    expect(voltage?.semanticId).toBeTruthy()
    expect(voltage?.semanticId.keys[0].value).toBe('0173-1#02-AAZ283#001')
  })

  it('sets null semanticId for elements without IRDI', () => {
    const result = parseAiResponse(VALID_RESPONSE)
    const submodels = extractionResultToSubmodels(result)
    const weight = submodels[0].submodelElements.find((e: any) => e.idShort === 'Weight')
    expect(weight?.semanticId).toBeNull()
  })
})
