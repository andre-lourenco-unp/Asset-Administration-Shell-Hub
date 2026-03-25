import type { SubmodelTemplate } from './index-types'

export const TECHNICAL_DATA_TEMPLATE: SubmodelTemplate = {
  id: 'technical-data',
  name: 'Technical Data',
  idtaSpec: 'IDTA-02003-1-2',
  description: 'Technical properties and specifications of an asset',
  version: '1.2',
  buildSubmodel: (idPrefix = 'urn:example') => ({
    idShort: 'TechnicalData',
    id: `${idPrefix}:TechnicalData`,
    kind: 'Instance',
    description: [{ language: 'en', text: 'Technical Data submodel following IDTA-02003' }],
    administration: null,
    semanticId: {
      type: 'ExternalReference',
      keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2' }]
    },
    qualifiers: [],
    embeddedDataSpecifications: [],
    rawData: null,
    submodelElements: [
      {
        idShort: 'GeneralInformation',
        modelType: 'SubmodelElementCollection',
        description: [{ language: 'en', text: 'General product information' }],
        semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/ZVEI/TechnicalData/GeneralInformation/1/1' }] },
        children: [
          { idShort: 'ManufacturerName', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO677#002' }] }, value: { en: '' }, cardinality: 'One' },
          { idShort: 'ManufacturerProductDesignation', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAW338#001' }] }, value: { en: '' }, cardinality: 'One' },
          { idShort: 'ManufacturerArticleNumber', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO676#003' }] }, value: '' },
          { idShort: 'ManufacturerOrderCode', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO227#002' }] }, value: '' },
        ]
      },
      {
        idShort: 'TechnicalProperties',
        modelType: 'SubmodelElementCollection',
        description: [{ language: 'en', text: 'Technical properties - add your specific properties here' }],
        semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/ZVEI/TechnicalData/TechnicalProperties/1/1' }] },
        children: []
      },
      {
        idShort: 'FurtherInformation',
        modelType: 'SubmodelElementCollection',
        description: [{ language: 'en', text: 'Further information' }],
        semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/ZVEI/TechnicalData/FurtherInformation/1/1' }] },
        children: [
          { idShort: 'ValidDate', modelType: 'Property', valueType: 'xs:date', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAR972#002' }] }, value: '' },
          { idShort: 'Keywords', modelType: 'MultiLanguageProperty', value: { en: '' } },
        ]
      }
    ]
  } as any)
}
