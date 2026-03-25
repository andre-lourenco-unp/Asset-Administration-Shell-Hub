/**
 * Factory functions for creating AAS SubmodelElements.
 * Extracted from aas-editor.tsx for testability and reuse.
 */

import { CAPABILITY_SEMANTIC_IDS, DEFAULT_ROLE_QUALIFIERS, type AASQualifier } from '@/lib/types/capability'

export type SubmodelElementModelType =
  | "Property"
  | "MultiLanguageProperty"
  | "SubmodelElementCollection"
  | "SubmodelElementList"
  | "File"
  | "Blob"
  | "Range"
  | "ReferenceElement"
  | "Entity"
  | "Capability"
  | "Operation"
  | "BasicEventElement"
  | "RelationshipElement"
  | "AnnotatedRelationshipElement"

export type ElementType = SubmodelElementModelType | "CapabilityName"

export type Cardinality = "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany"

export interface SubmodelElement {
  idShort: string
  modelType: SubmodelElementModelType
  valueType?: string
  value?: any
  cardinality?: Cardinality
  description?: string
  semanticId?: string | { keys?: { value?: string }[] }
  children?: SubmodelElement[]
  contentType?: string
  entityType?: "CoManagedEntity" | "SelfManagedEntity"
  min?: string
  max?: string
  first?: any
  second?: any
  observed?: any
  inputVariables?: any[]
  outputVariables?: any[]
  inoutputVariables?: any[]
  qualifiers?: AASQualifier[]
}

export interface CreateElementParams {
  type: ElementType
  idShort: string
  cardinality: Cardinality
  description: string
  semanticId: string
  valueType?: string
  entityType?: "CoManagedEntity" | "SelfManagedEntity"
}

/** The 4 inner elements of a CapabilityName container */
function capabilityInnerChildren(capabilityIdShort: string): SubmodelElement[] {
  return [
    {
      idShort: capabilityIdShort,
      modelType: "Capability",
      cardinality: "One",
      description: "The capability element",
      qualifiers: DEFAULT_ROLE_QUALIFIERS.map(q => ({ ...q })),
    },
    { idShort: "CapabilityComment", modelType: "MultiLanguageProperty", cardinality: "ZeroToOne", description: "Comment about this capability" },
    {
      idShort: "PropertySet", modelType: "SubmodelElementCollection", cardinality: "ZeroToMany",
      description: "Set of properties for this capability",
      semanticId: CAPABILITY_SEMANTIC_IDS.PropertySet, children: [],
    },
    {
      idShort: "CapabilityRelations", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne",
      description: "Relations and constraints",
      semanticId: CAPABILITY_SEMANTIC_IDS.CapabilityRelations, children: [
        {
          idShort: "ConstraintSet", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne",
          semanticId: CAPABILITY_SEMANTIC_IDS.ConstraintSet, children: [],
        },
        {
          idShort: "ComposedOfSet", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne",
          semanticId: CAPABILITY_SEMANTIC_IDS.ComposedOfSet, children: [],
        },
        {
          idShort: "GeneralizedBySet", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne",
          semanticId: CAPABILITY_SEMANTIC_IDS.GeneralizedBySet, children: [],
        },
      ],
    },
  ]
}

/** Wraps the 4 capability elements inside a CapabilityName SMC */
function capabilityNameContainer(capabilityIdShort: string): SubmodelElement {
  return {
    idShort: "CapabilityName",
    modelType: "SubmodelElementCollection",
    cardinality: "One",
    description: "A named capability container",
    children: capabilityInnerChildren(capabilityIdShort),
  }
}

/**
 * Creates a new SubmodelElement based on the given type and parameters.
 * Handles CapabilityName pseudo-type.
 */
export function createElement(params: CreateElementParams): SubmodelElement {
  const { type, idShort, cardinality, description, semanticId, valueType, entityType } = params

  // CapabilityName: SMC with 4 default children (to add inside an existing CapabilitySet)
  if (type === "CapabilityName") {
    return {
      idShort: idShort || "CapabilityName",
      modelType: "SubmodelElementCollection",
      cardinality,
      description: description || "A named capability container",
      semanticId: semanticId || undefined,
      children: capabilityInnerChildren("Capability1"),
    }
  }

  const base: SubmodelElement = {
    idShort,
    modelType: type as SubmodelElementModelType,
    cardinality,
    description: description || undefined,
    semanticId: semanticId || undefined,
  }

  switch (type) {
    case "Property":
      return { ...base, valueType: valueType || "string", value: "" }
    case "MultiLanguageProperty":
      return { ...base, value: { en: "" } }
    case "SubmodelElementCollection":
    case "SubmodelElementList":
      return { ...base, children: [] }
    case "File":
      return { ...base, value: "", contentType: "" }
    case "Blob":
      return { ...base, value: "", contentType: "application/octet-stream" }
    case "Range":
      return { ...base, valueType: valueType || "string", min: "", max: "" }
    case "ReferenceElement":
      return { ...base, value: { type: "ModelReference", keys: [] } }
    case "Entity":
      return { ...base, entityType: entityType || "CoManagedEntity", children: [] }
    case "Capability":
      return { ...base, qualifiers: DEFAULT_ROLE_QUALIFIERS.map(q => ({ ...q })) }
    case "Operation":
      return { ...base, inputVariables: [], outputVariables: [], inoutputVariables: [] }
    case "BasicEventElement":
      return { ...base, observed: { type: "ModelReference", keys: [] } }
    case "RelationshipElement":
    case "AnnotatedRelationshipElement":
      return { ...base, first: { type: "ModelReference", keys: [] }, second: { type: "ModelReference", keys: [] } }
    default:
      return base
  }
}

/**
 * Generates the default template structure for a CapabilityDescription submodel.
 */
export function generateCapabilityTemplateStructure(): SubmodelElement[] {
  return [
    {
      idShort: "CapabilitySet",
      modelType: "SubmodelElementCollection",
      cardinality: "OneToMany",
      description: "Set of capabilities",
      semanticId: CAPABILITY_SEMANTIC_IDS.CapabilitySet,
      children: [capabilityNameContainer("Capability1")],
    },
  ]
}

/** Creates a PropertyConstraintContainer with ConstraintPropertyRelations */
export function createPropertyConstraintContainer(params: {
  idShort: string
  constraintType: 'BasicConstraint' | 'CustomConstraint' | 'OCLConstraint' | 'OperationConstraint'
  value: string
  conditionalType: string
  targetPropertyPath: string
  constraintElementPath: string
}): SubmodelElement {
  return {
    idShort: params.idShort,
    modelType: "SubmodelElementCollection",
    semanticId: CAPABILITY_SEMANTIC_IDS.PropertyConstraintContainer,
    children: [
      {
        idShort: params.constraintType,
        modelType: "Property",
        valueType: "xs:string",
        value: params.value,
        semanticId: `https://admin-shell.io/idta/CapabilityDescription/PropertyConstraintType/${params.constraintType}/1/0`,
      },
      {
        idShort: "ConstraintType",
        modelType: "Property",
        valueType: "xs:string",
        value: params.constraintType,
        semanticId: CAPABILITY_SEMANTIC_IDS.ConstraintType,
      },
      {
        idShort: "PropertyConditionalType",
        modelType: "Property",
        valueType: "xs:string",
        value: params.conditionalType,
        semanticId: CAPABILITY_SEMANTIC_IDS.PropertyConditionalType,
      },
      {
        idShort: "ConstraintPropertyRelations",
        modelType: "SubmodelElementCollection",
        semanticId: CAPABILITY_SEMANTIC_IDS.ConstraintPropertyRelations,
        children: [
          {
            idShort: "ConstraintHasProperty",
            modelType: "RelationshipElement",
            semanticId: CAPABILITY_SEMANTIC_IDS.ConstraintHasProperty,
            first: { type: "ModelReference", keys: [{ type: "Property", value: params.constraintElementPath }] },
            second: { type: "ModelReference", keys: [{ type: "Property", value: params.targetPropertyPath }] },
          },
        ],
      },
    ],
  }
}

/** All available element types for the Add Element dialog */
export const ALL_ELEMENT_TYPES: { value: string; label: string; description: string }[] = [
  { value: "Property", label: "Property", description: "A single value with a data type" },
  { value: "MultiLanguageProperty", label: "Multi-Language Property", description: "A value in multiple languages" },
  { value: "SubmodelElementCollection", label: "Collection (SMC)", description: "A container for child elements" },
  { value: "SubmodelElementList", label: "List (SML)", description: "An ordered list of elements" },
  { value: "File", label: "File", description: "A reference to a file" },
  { value: "Blob", label: "Blob", description: "Binary data stored inline" },
  { value: "Range", label: "Range", description: "A value range with min and max" },
  { value: "ReferenceElement", label: "Reference Element", description: "A reference to another element" },
  { value: "Entity", label: "Entity", description: "An entity with optional asset ID" },
  { value: "Capability", label: "Capability", description: "A capability of the asset" },
  { value: "CapabilityName", label: "Capability Name", description: "IDTA CapabilityName with Capability, Comment, PropertySet & Relations" },
  { value: "Operation", label: "Operation", description: "An operation with inputs/outputs" },
  { value: "BasicEventElement", label: "Basic Event Element", description: "An event element" },
  { value: "RelationshipElement", label: "Relationship Element", description: "A relationship between two elements" },
  { value: "AnnotatedRelationshipElement", label: "Annotated Relationship", description: "A relationship with annotations" },
]
