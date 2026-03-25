import type { SubmodelTemplate } from './index-types'

export const NAMEPLATE_TEMPLATE: SubmodelTemplate = {
  id: 'nameplate',
  name: 'Digital Nameplate',
  idtaSpec: 'IDTA-02006-2-0',
  description: 'Digital nameplate for industrial equipment',
  version: '2.0',
  buildSubmodel: (idPrefix = 'urn:example') => ({
    idShort: 'Nameplate',
    id: `${idPrefix}:Nameplate`,
    kind: 'Instance',
    description: [{ language: 'en', text: 'Digital Nameplate following IDTA-02006' }],
    administration: null,
    semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate' }] },
    qualifiers: [],
    embeddedDataSpecifications: [],
    rawData: null,
    submodelElements: [
      { idShort: 'URIOfTheProduct', modelType: 'Property', valueType: 'xs:anyURI', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAY812#001' }] }, value: '' },
      { idShort: 'ManufacturerName', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO677#002' }] }, value: { en: '' } },
      { idShort: 'ManufacturerProductDesignation', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAW338#001' }] }, value: { en: '' } },
      { idShort: 'ContactInformation', modelType: 'SubmodelElementCollection', children: [
        { idShort: 'NationalCode', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO134#002' }] }, value: { en: '' } },
        { idShort: 'CityTown', modelType: 'MultiLanguageProperty', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO132#002' }] }, value: { en: '' } },
      ]},
      { idShort: 'SerialNumber', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAM556#002' }] }, value: '' },
      { idShort: 'YearOfConstruction', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAP906#001' }] }, value: '' },
      { idShort: 'DateOfManufacture', modelType: 'Property', valueType: 'xs:date', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAR972#002' }] }, value: '' },
      { idShort: 'HardwareVersion', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAN270#002' }] }, value: '' },
      { idShort: 'FirmwareVersion', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAM985#002' }] }, value: '' },
      { idShort: 'SoftwareVersion', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAM737#002' }] }, value: '' },
      { idShort: 'CountryOfOrigin', modelType: 'Property', valueType: 'xs:string', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO259#004' }] }, value: '' },
    ]
  } as any)
}
