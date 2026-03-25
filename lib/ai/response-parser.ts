import type { SubmodelInfo } from '@/lib/types'

export type ConfidenceTier = 'high' | 'medium' | 'low'

export interface ExtractedElement {
  idShort: string
  modelType: string
  valueType?: string
  value?: string
  semanticIdIrdi?: string
  unit?: string
  confidence: number
  tier: ConfidenceTier
  needsReview: boolean
}

export interface ExtractedSubmodel {
  idShort: string
  id: string
  description: string
  elements: ExtractedElement[]
}

export interface ExtractionResult {
  assetIdShort: string
  assetId: string
  assetDescription: string
  assetKind: string
  submodels: ExtractedSubmodel[]
  warnings: string[]
}

function tier(value: string): ConfidenceTier {
  return value && value.trim() ? 'high' : 'low'
}

function el(idShort: string, value: string, opts: {
  modelType?: string
  valueType?: string
  semanticIdIrdi?: string
  unit?: string
} = {}): ExtractedElement {
  const filled = !!(value && value.trim())
  const t = filled ? 'high' : 'low'
  return {
    idShort,
    modelType: opts.modelType || 'Property',
    valueType: opts.valueType || 'xs:string',
    value: value || '',
    semanticIdIrdi: opts.semanticIdIrdi,
    unit: opts.unit,
    confidence: filled ? 90 : 40,
    tier: t,
    needsReview: !filled,
  }
}

export function parseAiResponse(rawJson: string): ExtractionResult {
  const warnings: string[] = []

  // Extract JSON — try fenced block, then outermost { }
  let jsonStr = rawJson.trim()
  const fenced = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    jsonStr = fenced[1].trim()
  } else {
    const first = rawJson.indexOf('{')
    const last = rawJson.lastIndexOf('}')
    if (first !== -1 && last > first) jsonStr = rawJson.slice(first, last + 1)
  }

  let ai: any
  try {
    ai = JSON.parse(jsonStr)
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.')
  }

  if (!ai.assetIdShort) throw new Error('AI response missing assetIdShort field')

  const assetIdShort = String(ai.assetIdShort).replace(/[^a-zA-Z0-9_-]/g, '') || 'ExtractedAsset'
  const np = ai.Nameplate || {}
  const td = ai.TechnicalData || {}
  const tdGeneral = td.GeneralInformation || {}
  const tdProps = td.TechnicalProperties || {}
  const cf = ai.CarbonFootprint || {}
  const hd = ai.HandoverDocumentation || {}
  const npContact = np.ContactInformation || {}

  // ── Nameplate (IDTA-02006) ──────────────────────────────────────────────────
  const nameplateElements: ExtractedElement[] = [
    el('URIOfTheProduct',              np.URIOfTheProduct,              { valueType: 'xs:anyURI',  semanticIdIrdi: '0173-1#02-AAY812#001' }),
    el('ManufacturerName',             np.ManufacturerName,             { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAO677#002' }),
    el('ManufacturerProductDesignation', np.ManufacturerProductDesignation, { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAW338#001' }),
    el('SerialNumber',                 np.SerialNumber,                 { semanticIdIrdi: '0173-1#02-AAM556#002' }),
    el('YearOfConstruction',           np.YearOfConstruction,           { semanticIdIrdi: '0173-1#02-AAP906#001' }),
    el('DateOfManufacture',            np.DateOfManufacture,            { valueType: 'xs:date',    semanticIdIrdi: '0173-1#02-AAR972#002' }),
    el('HardwareVersion',              np.HardwareVersion,              { semanticIdIrdi: '0173-1#02-AAN270#002' }),
    el('FirmwareVersion',              np.FirmwareVersion,              { semanticIdIrdi: '0173-1#02-AAM985#002' }),
    el('SoftwareVersion',              np.SoftwareVersion,              { semanticIdIrdi: '0173-1#02-AAM737#002' }),
    el('CountryOfOrigin',              np.CountryOfOrigin,              { semanticIdIrdi: '0173-1#02-AAO259#004' }),
    el('ContactInformation_NationalCode', npContact.NationalCode || '', { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAO134#002' }),
    el('ContactInformation_CityTown',     npContact.CityTown || '',     { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAO132#002' }),
  ]

  // ── TechnicalData (IDTA-02003) ──────────────────────────────────────────────
  const techElements: ExtractedElement[] = [
    el('ManufacturerName',             tdGeneral.ManufacturerName,             { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAO677#002' }),
    el('ManufacturerProductDesignation', tdGeneral.ManufacturerProductDesignation, { modelType: 'MultiLanguageProperty', semanticIdIrdi: '0173-1#02-AAW338#001' }),
    el('ManufacturerArticleNumber',    tdGeneral.ManufacturerArticleNumber,    { semanticIdIrdi: '0173-1#02-AAO676#003' }),
    el('ManufacturerOrderCode',        tdGeneral.ManufacturerOrderCode,        { semanticIdIrdi: '0173-1#02-AAO227#002' }),
    // Free-form technical properties from the document
    ...Object.entries(tdProps).map(([key, value]) =>
      el(key.replace(/[^a-zA-Z0-9_-]/g, ''), String(value), { confidence: 90 } as any)
    ),
  ]

  if (Object.keys(tdProps).length === 0) {
    warnings.push('No technical properties found in the document. Add them manually in the TechnicalProperties collection.')
  }

  // ── CarbonFootprint (IDTA-02023) ────────────────────────────────────────────
  const cfElements: ExtractedElement[] = [
    el('PCFCO2eq',                        cf.PCFCO2eq,                        { valueType: 'xs:decimal', semanticIdIrdi: '0173-1#02-ABG855#001' }),
    el('PCFReferenceValueForCalculation', cf.PCFReferenceValueForCalculation, {}),
    el('PCFQuantityOfMeasureForCalculation', cf.PCFQuantityOfMeasureForCalculation, { valueType: 'xs:decimal' }),
    el('PCFLifeCyclePhase',               cf.PCFLifeCyclePhase || 'A1-A3',    {}),
  ]

  // ── HandoverDocumentation (IDTA-02004) ──────────────────────────────────────
  const hdElements: ExtractedElement[] = [
    el('Title',             hd.Title,             { modelType: 'MultiLanguageProperty' }),
    el('Summary',           hd.Summary,           { modelType: 'MultiLanguageProperty' }),
    el('Language',          hd.Language || 'en',  {}),
    el('DocumentVersionId', hd.DocumentVersionId || '1', {}),
  ]

  const submodels: ExtractedSubmodel[] = [
    {
      idShort: 'Nameplate',
      id: `${ai.assetId || `urn:extracted:${assetIdShort}`}:Nameplate`,
      description: 'Digital Nameplate — IDTA-02006',
      elements: nameplateElements,
    },
    {
      idShort: 'TechnicalData',
      id: `${ai.assetId || `urn:extracted:${assetIdShort}`}:TechnicalData`,
      description: 'Technical Data — IDTA-02003',
      elements: techElements,
    },
    {
      idShort: 'CarbonFootprint',
      id: `${ai.assetId || `urn:extracted:${assetIdShort}`}:CarbonFootprint`,
      description: 'Carbon Footprint — IDTA-02023',
      elements: cfElements,
    },
    {
      idShort: 'HandoverDocumentation',
      id: `${ai.assetId || `urn:extracted:${assetIdShort}`}:HandoverDocumentation`,
      description: 'Handover Documentation — IDTA-02004',
      elements: hdElements,
    },
  ]

  return {
    assetIdShort,
    assetId: String(ai.assetId || `urn:extracted:${assetIdShort}`),
    assetDescription: String(ai.assetDescription || ''),
    assetKind: 'Instance',
    submodels,
    warnings,
  }
}

export function extractionResultToSubmodels(result: ExtractionResult): SubmodelInfo[] {
  // Semantic IDs per submodel (IDTA official URIs)
  const submodelSemanticIds: Record<string, string> = {
    Nameplate:              'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
    TechnicalData:          'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2',
    CarbonFootprint:        'https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/0/9',
    HandoverDocumentation:  'https://admin-shell.io/vdi/2770/1/0/Documentation',
  }

  return result.submodels.map(sm => ({
    idShort: sm.idShort,
    id: sm.id,
    kind: 'Instance',
    description: [{ language: 'en', text: sm.description }],
    administration: null,
    semanticId: submodelSemanticIds[sm.idShort]
      ? { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: submodelSemanticIds[sm.idShort] }] }
      : null,
    qualifiers: [],
    embeddedDataSpecifications: [],
    rawData: null,
    submodelElements: sm.elements.map(el => ({
      idShort: el.idShort,
      modelType: el.modelType,
      valueType: el.valueType,
      value: el.value,
      unit: el.unit,
      semanticId: el.semanticIdIrdi
        ? { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: el.semanticIdIrdi }] }
        : null,
    })),
  }))
}
