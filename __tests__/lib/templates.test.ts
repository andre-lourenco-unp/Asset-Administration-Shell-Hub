import { SUBMODEL_TEMPLATES, getTemplateById } from '@/lib/templates'

describe('Submodel Templates', () => {
  it('has 4 templates registered', () => {
    expect(SUBMODEL_TEMPLATES).toHaveLength(4)
  })

  it('each template has required fields', () => {
    for (const t of SUBMODEL_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.idtaSpec).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(typeof t.buildSubmodel).toBe('function')
    }
  })

  it('getTemplateById returns correct template', () => {
    const t = getTemplateById('nameplate')
    expect(t?.name).toBe('Digital Nameplate')
  })

  it('getTemplateById returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined()
  })

  describe('TechnicalData template', () => {
    const t = getTemplateById('technical-data')!
    const submodel = t.buildSubmodel('urn:test')

    it('builds with correct idShort', () => {
      expect(submodel.idShort).toBe('TechnicalData')
    })
    it('builds with test id prefix', () => {
      expect(submodel.id).toBe('urn:test:TechnicalData')
    })
    it('has semantic ID', () => {
      expect(submodel.semanticId).toBeTruthy()
    })
    it('has required submodelElements', () => {
      expect((submodel as any).submodelElements.length).toBeGreaterThan(0)
    })
    it('has GeneralInformation collection', () => {
      const gi = (submodel as any).submodelElements.find((e: any) => e.idShort === 'GeneralInformation')
      expect(gi).toBeTruthy()
      expect(gi.modelType).toBe('SubmodelElementCollection')
    })
  })

  describe('Nameplate template', () => {
    const t = getTemplateById('nameplate')!
    const submodel = t.buildSubmodel()

    it('builds with default id prefix', () => {
      expect(submodel.id).toContain('Nameplate')
    })
    it('has SerialNumber property', () => {
      const sn = (submodel as any).submodelElements.find((e: any) => e.idShort === 'SerialNumber')
      expect(sn?.valueType).toBe('xs:string')
    })
  })

  describe('CarbonFootprint template', () => {
    const t = getTemplateById('carbon-footprint')!
    const submodel = t.buildSubmodel()

    it('has ProductCarbonFootprint collection', () => {
      const pcf = (submodel as any).submodelElements.find((e: any) => e.idShort === 'ProductCarbonFootprint')
      expect(pcf).toBeTruthy()
    })
  })

  describe('HandoverDocumentation template', () => {
    const t = getTemplateById('handover-documentation')!
    const submodel = t.buildSubmodel()

    it('has Document01 collection', () => {
      const doc = (submodel as any).submodelElements.find((e: any) => e.idShort === 'Document01')
      expect(doc).toBeTruthy()
    })
  })
})
