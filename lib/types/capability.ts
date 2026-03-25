export type CapabilityRole = 'Offered' | 'Required' | 'NotAssigned'

/** Canonical IDTA CapabilityDescription semantic IDs (version segment after element name) */
export const CAPABILITY_SEMANTIC_IDS = {
  Submodel: 'https://admin-shell.io/idta/CapabilityDescription/1/0/Submodel',
  CapabilitySet: 'https://admin-shell.io/idta/CapabilityDescription/CapabilitySet/1/0',
  PropertySet: 'https://admin-shell.io/idta/CapabilityDescription/PropertySet/1/0',
  CapabilityRelations: 'https://admin-shell.io/idta/CapabilityDescription/CapabilityRelations/1/0',
  ConstraintSet: 'https://admin-shell.io/idta/CapabilityDescription/ConstraintSet/1/0',
  PropertyConstraintContainer: 'https://admin-shell.io/idta/CapabilityDescription/PropertyConstraintContainer/1/0',
  ConstraintType: 'https://admin-shell.io/idta/CapabilityDescription/ConstraintType/1/0',
  PropertyConditionalType: 'https://admin-shell.io/idta/CapabilityDescription/PropertyConditionalType/1/0',
  ConstraintPropertyRelations: 'https://admin-shell.io/idta/CapabilityDescription/ConstraintPropertyRelations/1/0',
  ConstraintHasProperty: 'https://admin-shell.io/idta/CapabilityDescription/ConstraintHasProperty/1/0',
  ComposedOfSet: 'https://admin-shell.io/idta/CapabilityDescription/ComposedOfSet/1/0',
  GeneralizedBySet: 'https://admin-shell.io/idta/CapabilityDescription/GeneralizedBySet/1/0',
  IsComposedOf: 'https://admin-shell.io/idta/CapabilityDescription/IsComposedOf/1/0',
  IsGeneralizedBy: 'https://admin-shell.io/idta/CapabilityDescription/IsGeneralizedBy/1/0',
} as const

/** Qualifier structure for AAS elements */
export interface AASQualifier {
  type: string
  valueType: string
  value: string
  semanticId?: string
}

/** The 3 role qualifiers that MUST be present on every Capability element (exactly one true) */
export const DEFAULT_ROLE_QUALIFIERS: AASQualifier[] = [
  {
    type: 'CapabilityRoleQualifier/Offered',
    valueType: 'xs:boolean',
    value: 'false',
    semanticId: 'https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Offered/1/0',
  },
  {
    type: 'CapabilityRoleQualifier/Required',
    valueType: 'xs:boolean',
    value: 'false',
    semanticId: 'https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Required/1/0',
  },
  {
    type: 'CapabilityRoleQualifier/NotAssigned',
    valueType: 'xs:boolean',
    value: 'true',
    semanticId: 'https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/NotAssigned/1/0',
  },
]

export interface ParsedPropertyValue {
  type: 'single' | 'range' | 'list'
  value?: string
  valueType?: string
  min?: string
  max?: string
  items?: string[]
}

export interface ParsedPropertyContainer {
  idShort: string
  propertyIdShort: string
  data: ParsedPropertyValue
  supplementalSemanticId?: string
}

export interface ParsedCapabilityConstraint {
  idShort: string
  constraintType: 'BasicConstraint' | 'CustomConstraint' | 'OCLConstraint' | 'OperationConstraint'
  value?: string
  conditionalType?: string
  /** Resolved from ConstraintHasProperty relationship second element */
  constrainedPropertyIdShort?: string
}

/** A reference from one capability to another (ComposedOf or GeneralizedBy) */
export interface ParsedCapabilityRelation {
  idShort: string
  type: 'IsComposedOf' | 'IsGeneralizedBy'
  /** The first element reference (source capability) */
  firstValue?: string
  /** The second element reference (target capability) */
  secondValue?: string
}

export interface ParsedCapability {
  containerIdShort: string
  capabilityIdShort: string
  role: CapabilityRole
  comment?: string
  properties: ParsedPropertyContainer[]
  constraints: ParsedCapabilityConstraint[]
  composedOf: ParsedCapabilityRelation[]
  generalizedBy: ParsedCapabilityRelation[]
  supplementalSemanticId?: string
}

export interface ParsedCapabilitySubmodel {
  submodelId: string
  capabilities: ParsedCapability[]
}
