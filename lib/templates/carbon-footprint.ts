import type { SubmodelTemplate } from './index-types'

export const CARBON_FOOTPRINT_TEMPLATE: SubmodelTemplate = {
  id: 'carbon-footprint',
  name: 'Carbon Footprint',
  idtaSpec: 'IDTA-02023-0-9',
  description: 'Carbon footprint of a product following PCF/TCF methodology',
  version: '0.9',
  buildSubmodel: (idPrefix = 'urn:example') => ({
    idShort: 'CarbonFootprint',
    id: `${idPrefix}:CarbonFootprint`,
    kind: 'Instance',
    description: [{ language: 'en', text: 'Carbon Footprint submodel following IDTA-02023' }],
    administration: null,
    semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/0/9' }] },
    qualifiers: [],
    embeddedDataSpecifications: [],
    rawData: null,
    submodelElements: [
      {
        idShort: 'ProductCarbonFootprint',
        modelType: 'SubmodelElementCollection',
        semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/idta/CarbonFootprint/ProductCarbonFootprint/0/9' }] },
        children: [
          { idShort: 'PCFCO2eq', modelType: 'Property', valueType: 'xs:decimal', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-ABG855#001' }] }, value: '0' },
          { idShort: 'PCFReferenceValueForCalculation', modelType: 'Property', valueType: 'xs:string', value: '' },
          { idShort: 'PCFQuantityOfMeasureForCalculation', modelType: 'Property', valueType: 'xs:decimal', value: '1' },
          { idShort: 'PCFLifeCyclePhase', modelType: 'Property', valueType: 'xs:string', value: 'A1-A3' },
          { idShort: 'ExplanatoryStatement', modelType: 'MultiLanguageProperty', value: { en: '' } },
        ]
      }
    ]
  } as any)
}
