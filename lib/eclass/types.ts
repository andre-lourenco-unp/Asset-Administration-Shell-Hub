export interface EClassProperty {
  irdi: string
  preferredName: string
  definition: string
  unit?: string
  dataType?: string
  xsdType?: string
}

export interface EClassSearchResult {
  property: EClassProperty
  score: number
}
