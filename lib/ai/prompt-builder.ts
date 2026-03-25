/**
 * Builds the extraction prompt using exact IDTA template schemas.
 * Claude only fills VALUES — structure is fixed to our 4 IDTA submodels.
 */
export function buildAasExtractionPrompt(pdfText: string, idPrefix = 'urn:extracted'): string {
  const truncated = pdfText.slice(0, 12000)

  return `You are an expert in Asset Administration Shells (AAS) following IDTA specifications v3.1.

Extract information from this product document and fill values into the exact JSON schema below.
Only fill values you can find in the document. Use "" for unknown/missing values.
Return ONLY valid JSON — no markdown, no explanation.

{
  "assetIdShort": "",
  "assetId": "${idPrefix}:ASSET_ID",
  "assetDescription": "",

  "Nameplate": {
    "URIOfTheProduct": "",
    "ManufacturerName": "",
    "ManufacturerProductDesignation": "",
    "SerialNumber": "",
    "YearOfConstruction": "",
    "DateOfManufacture": "",
    "HardwareVersion": "",
    "FirmwareVersion": "",
    "SoftwareVersion": "",
    "CountryOfOrigin": "",
    "ContactInformation": {
      "NationalCode": "",
      "CityTown": ""
    }
  },

  "TechnicalData": {
    "GeneralInformation": {
      "ManufacturerName": "",
      "ManufacturerProductDesignation": "",
      "ManufacturerArticleNumber": "",
      "ManufacturerOrderCode": ""
    },
    "TechnicalProperties": {}
  },

  "CarbonFootprint": {
    "PCFCO2eq": "",
    "PCFReferenceValueForCalculation": "",
    "PCFQuantityOfMeasureForCalculation": "",
    "PCFLifeCyclePhase": ""
  },

  "HandoverDocumentation": {
    "Title": "",
    "Summary": "",
    "Language": "en",
    "DocumentVersionId": "1"
  }
}

Rules:
- assetIdShort: CamelCase, no spaces, start with letter, derived from product name
- assetId: replace ASSET_ID with a short slug of the product name
- TechnicalProperties: add any numeric specs, dimensions, ratings, voltages, weights, speeds, etc.
  found in the document as flat key-value pairs. Example: { "MaxPayload": "10 kg", "Reach": "1100 mm" }
- All values must be strings

DOCUMENT:
${truncated}`
}
