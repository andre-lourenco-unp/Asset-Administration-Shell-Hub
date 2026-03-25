import type { SubmodelTemplate } from './index-types'

export const HANDOVER_DOCUMENTATION_TEMPLATE: SubmodelTemplate = {
  id: 'handover-documentation',
  name: 'Handover Documentation',
  idtaSpec: 'IDTA-02004-1-2',
  description: 'Documentation handover package for an asset',
  version: '1.2',
  buildSubmodel: (idPrefix = 'urn:example') => ({
    idShort: 'HandoverDocumentation',
    id: `${idPrefix}:HandoverDocumentation`,
    kind: 'Instance',
    description: [{ language: 'en', text: 'Handover Documentation following IDTA-02004' }],
    administration: null,
    semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/vdi/2770/1/0/Documentation' }] },
    qualifiers: [],
    embeddedDataSpecifications: [],
    rawData: null,
    submodelElements: [
      {
        idShort: 'Document01',
        modelType: 'SubmodelElementCollection',
        description: [{ language: 'en', text: 'First document - rename as needed' }],
        children: [
          {
            idShort: 'DocumentClassification',
            modelType: 'SubmodelElementCollection',
            children: [
              { idShort: 'ClassId', modelType: 'Property', valueType: 'xs:string', value: '03-04' },
              { idShort: 'ClassName', modelType: 'MultiLanguageProperty', value: { en: 'Operating Manual' } },
              { idShort: 'ClassificationSystem', modelType: 'Property', valueType: 'xs:string', value: 'VDI2770:2018' },
            ]
          },
          {
            idShort: 'DocumentVersion01',
            modelType: 'SubmodelElementCollection',
            children: [
              { idShort: 'Language', modelType: 'Property', valueType: 'xs:string', value: 'en' },
              { idShort: 'DocumentVersionId', modelType: 'Property', valueType: 'xs:string', value: '1' },
              { idShort: 'Summary', modelType: 'MultiLanguageProperty', value: { en: '' } },
              { idShort: 'Title', modelType: 'MultiLanguageProperty', value: { en: '' } },
              { idShort: 'DigitalFile01', modelType: 'File', value: '', contentType: 'application/pdf' },
            ]
          }
        ]
      }
    ]
  } as any)
}
