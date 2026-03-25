import {
  CAPABILITY_SEMANTIC_IDS,
  type CapabilityRole,
  type ParsedCapability,
  type ParsedCapabilityConstraint,
  type ParsedCapabilityRelation,
  type ParsedCapabilitySubmodel,
  type ParsedPropertyContainer,
  type ParsedPropertyValue,
} from '@/lib/types/capability'

const AAS_NS = 'https://admin-shell.io/aas/3/0'

/** Returns element children of a parent (compatible with @xmldom/xmldom which lacks .children) */
function elementChildren(parent: Element): Element[] {
  const result: Element[] = []
  const nodes = parent.childNodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === 1) {
      result.push(node as Element)
    }
  }
  return result
}

function getLocalElements(parent: Element, localName: string): Element[] {
  const result: Element[] = []
  for (const child of elementChildren(parent)) {
    if (child.localName === localName) {
      result.push(child)
    }
  }
  return result
}

function getLocalElement(parent: Element, localName: string): Element | null {
  for (const child of elementChildren(parent)) {
    if (child.localName === localName) {
      return child
    }
  }
  return null
}

function getTextContent(parent: Element, localName: string): string | undefined {
  const el = getLocalElement(parent, localName)
  return el?.textContent?.trim() || undefined
}

function getIdShort(el: Element): string {
  return getTextContent(el, 'idShort') ?? ''
}

function getSemanticIdKeyValue(el: Element): string | undefined {
  const semanticId = getLocalElement(el, 'semanticId')
  if (!semanticId) return undefined
  const keys = getLocalElement(semanticId, 'keys')
  if (!keys) return undefined
  const key = getLocalElement(keys, 'key')
  if (!key) return undefined
  return getTextContent(key, 'value')
}

function getSupplementalSemanticIdKeyValue(el: Element): string | undefined {
  const suppSemId = getLocalElement(el, 'supplementalSemanticIds')
  if (!suppSemId) return undefined
  const ref = getLocalElement(suppSemId, 'reference')
  if (!ref) return undefined
  const keys = getLocalElement(ref, 'keys')
  if (!keys) return undefined
  const key = getLocalElement(keys, 'key')
  if (!key) return undefined
  return getTextContent(key, 'value')
}

/** Checks if a submodel element is a CapabilityDescription submodel */
export function isCapabilitySubmodel(smElement: Element): boolean {
  const keyValue = getSemanticIdKeyValue(smElement)
  if (!keyValue) return false
  return keyValue === CAPABILITY_SEMANTIC_IDS.Submodel
}

function detectRole(capabilityEl: Element): CapabilityRole {
  const qualifiers = getLocalElement(capabilityEl, 'qualifiers')
  if (!qualifiers) return 'NotAssigned'

  const qualifierList = getLocalElements(qualifiers, 'qualifier')
  for (const q of qualifierList) {
    const valText = getTextContent(q, 'value')
    if (valText !== 'true') continue

    const semId = getSemanticIdKeyValue(q)
    if (!semId) continue

    if (semId.includes('CapabilityRoleQualifier/Offered')) return 'Offered'
    if (semId.includes('CapabilityRoleQualifier/Required')) return 'Required'
    if (semId.includes('CapabilityRoleQualifier/NotAssigned')) return 'NotAssigned'
  }

  return 'NotAssigned'
}

function parsePropertyValue(container: Element): ParsedPropertyValue {
  const valueWrapper = getLocalElement(container, 'value')
  if (!valueWrapper) return { type: 'single' }

  // Check children of the value wrapper for the actual property elements
  for (const child of elementChildren(valueWrapper)) {
    const tag = child.localName

    if (tag === 'range') {
      return {
        type: 'range',
        min: getTextContent(child, 'min'),
        max: getTextContent(child, 'max'),
        valueType: getTextContent(child, 'valueType'),
      }
    }

    if (tag === 'submodelElementList') {
      const listValue = getLocalElement(child, 'value')
      const items: string[] = []
      if (listValue) {
        const props = getLocalElements(listValue, 'property')
        for (const p of props) {
          const v = getTextContent(p, 'value')
          if (v) items.push(v)
        }
      }
      return { type: 'list', items }
    }

    if (tag === 'property') {
      return {
        type: 'single',
        value: getTextContent(child, 'value'),
        valueType: getTextContent(child, 'valueType'),
      }
    }
  }

  return { type: 'single' }
}

function parsePropertyContainers(propertySetEl: Element): ParsedPropertyContainer[] {
  const result: ParsedPropertyContainer[] = []
  const valueWrapper = getLocalElement(propertySetEl, 'value')
  if (!valueWrapper) return result

  const containers = getLocalElements(valueWrapper, 'submodelElementCollection')
  for (const container of containers) {
    const idShort = getIdShort(container)
    const data = parsePropertyValue(container)

    // Find the propertyIdShort from the actual data element inside value
    let propertyIdShort = idShort.replace(/Container$/, '')
    const innerValue = getLocalElement(container, 'value')
    if (innerValue) {
      for (const child of elementChildren(innerValue)) {
        const childIdShort = getIdShort(child)
        if (childIdShort) {
          propertyIdShort = childIdShort
          break
        }
      }
    }

    const suppSemId = getSupplementalSemanticIdKeyValue(container)

    result.push({
      idShort,
      propertyIdShort,
      data,
      ...(suppSemId ? { supplementalSemanticId: suppSemId } : {}),
    })
  }

  return result
}

function parseConstraints(relationsEl: Element): ParsedCapabilityConstraint[] {
  const result: ParsedCapabilityConstraint[] = []
  const relValue = getLocalElement(relationsEl, 'value')
  if (!relValue) return result

  const constraintSet = getLocalElements(relValue, 'submodelElementCollection')
    .find(el => getIdShort(el) === 'ConstraintSet')
  if (!constraintSet) return result

  const csValue = getLocalElement(constraintSet, 'value')
  if (!csValue) return result

  const constraintContainers = getLocalElements(csValue, 'submodelElementCollection')
  for (const cc of constraintContainers) {
    const idShort = getIdShort(cc)
    const ccValue = getLocalElement(cc, 'value')
    if (!ccValue) continue

    let constraintType: ParsedCapabilityConstraint['constraintType'] = 'BasicConstraint'
    let conditionalType: string | undefined
    let constraintValue: string | undefined

    const props = getLocalElements(ccValue, 'property')
    for (const p of props) {
      const pIdShort = getIdShort(p)
      if (pIdShort === 'ConstraintType') {
        const v = getTextContent(p, 'value') as ParsedCapabilityConstraint['constraintType']
        if (v) constraintType = v
      } else if (pIdShort === 'PropertyConditionalType') {
        conditionalType = getTextContent(p, 'value')
      } else {
        // This is the actual constraint value property
        constraintValue = getTextContent(p, 'value')
      }
    }

    // Resolve ConstraintHasProperty → second element for constrained property
    let constrainedPropertyIdShort: string | undefined
    const constraintRelations = getLocalElements(ccValue, 'submodelElementCollection')
      .find(el => getIdShort(el) === 'ConstraintPropertyRelations')
    if (constraintRelations) {
      const crValue = getLocalElement(constraintRelations, 'value')
      if (crValue) {
        const hasProperty = getLocalElements(crValue, 'relationshipElement')
          .find(el => getIdShort(el) === 'ConstraintHasProperty')
        if (hasProperty) {
          const second = getLocalElement(hasProperty, 'second')
          if (second) {
            const keysEl = getLocalElement(second, 'keys')
            if (keysEl) {
              const allKeys = getLocalElements(keysEl, 'key')
              if (allKeys.length > 0) {
                constrainedPropertyIdShort = getTextContent(allKeys[allKeys.length - 1], 'value')
              }
            }
          }
        }
      }
    }

    result.push({
      idShort,
      constraintType,
      ...(constraintValue !== undefined ? { value: constraintValue } : {}),
      ...(conditionalType ? { conditionalType } : {}),
      ...(constrainedPropertyIdShort ? { constrainedPropertyIdShort } : {}),
    })
  }

  return result
}

function parseCapabilityRelations(
  relationsEl: Element,
  setName: string,
  relationType: ParsedCapabilityRelation['type'],
): ParsedCapabilityRelation[] {
  const result: ParsedCapabilityRelation[] = []
  const relValue = getLocalElement(relationsEl, 'value')
  if (!relValue) return result

  const relationSet = getLocalElements(relValue, 'submodelElementCollection')
    .find(el => getIdShort(el) === setName)
  if (!relationSet) return result

  const setValue = getLocalElement(relationSet, 'value')
  if (!setValue) return result

  const relEls = getLocalElements(setValue, 'relationshipElement')
  for (const rel of relEls) {
    const idShort = getIdShort(rel)

    const extractRefValue = (refName: string): string | undefined => {
      const refEl = getLocalElement(rel, refName)
      if (!refEl) return undefined
      const keysEl = getLocalElement(refEl, 'keys')
      if (!keysEl) return undefined
      const allKeys = getLocalElements(keysEl, 'key')
      if (allKeys.length > 0) {
        return getTextContent(allKeys[allKeys.length - 1], 'value')
      }
      return undefined
    }

    result.push({
      idShort,
      type: relationType,
      firstValue: extractRefValue('first'),
      secondValue: extractRefValue('second'),
    })
  }

  return result
}

function parseCapabilityContainer(containerEl: Element): ParsedCapability {
  const containerIdShort = getIdShort(containerEl)
  const valueWrapper = getLocalElement(containerEl, 'value')

  let capabilityIdShort = containerIdShort
  let role: CapabilityRole = 'NotAssigned'
  let comment: string | undefined
  let properties: ParsedPropertyContainer[] = []
  let constraints: ParsedCapabilityConstraint[] = []
  let composedOf: ParsedCapabilityRelation[] = []
  let generalizedBy: ParsedCapabilityRelation[] = []
  let supplementalSemanticId: string | undefined

  if (valueWrapper) {
    // Find the capability element
    const capabilityEl = getLocalElement(valueWrapper, 'capability')
    if (capabilityEl) {
      capabilityIdShort = getIdShort(capabilityEl) || containerIdShort
      role = detectRole(capabilityEl)
      supplementalSemanticId = getSupplementalSemanticIdKeyValue(capabilityEl)
    }

    // Find comment (multiLanguageProperty)
    const mlps = getLocalElements(valueWrapper, 'multiLanguageProperty')
    for (const mlp of mlps) {
      if (getIdShort(mlp) === 'CapabilityComment') {
        const langValues = getLocalElement(mlp, 'value')
        if (langValues) {
          const langStr = getLocalElement(langValues, 'langStringTextType')
          if (langStr) {
            comment = getTextContent(langStr, 'text')
          }
        }
      }
    }

    // Find PropertySet and CapabilityRelations
    const secs = getLocalElements(valueWrapper, 'submodelElementCollection')
    for (const sec of secs) {
      const secIdShort = getIdShort(sec)
      if (secIdShort === 'PropertySet') {
        properties = parsePropertyContainers(sec)
      } else if (secIdShort === 'CapabilityRelations') {
        constraints = parseConstraints(sec)
        composedOf = parseCapabilityRelations(sec, 'ComposedOfSet', 'IsComposedOf')
        generalizedBy = parseCapabilityRelations(sec, 'GeneralizedBySet', 'IsGeneralizedBy')
      }
    }
  }

  return {
    containerIdShort,
    capabilityIdShort,
    role,
    ...(comment ? { comment } : {}),
    properties,
    constraints,
    composedOf,
    generalizedBy,
    ...(supplementalSemanticId ? { supplementalSemanticId } : {}),
  }
}

/** Parses a full CapabilityDescription submodel element */
export function parseCapabilitySubmodel(sm: Element): ParsedCapabilitySubmodel {
  const submodelId = getTextContent(sm, 'id') ?? ''

  const submodelElements = getLocalElement(sm, 'submodelElements')
  if (!submodelElements) return { submodelId, capabilities: [] }

  // Iterate ALL CapabilitySets (spec says 1..*)
  const capabilities: ParsedCapability[] = []
  const allSMCs = getLocalElements(submodelElements, 'submodelElementCollection')
  for (const smc of allSMCs) {
    const semId = getSemanticIdKeyValue(smc)
    if (semId !== CAPABILITY_SEMANTIC_IDS.CapabilitySet) continue

    const csValue = getLocalElement(smc, 'value')
    if (!csValue) continue

    const containers = getLocalElements(csValue, 'submodelElementCollection')
    for (const container of containers) {
      capabilities.push(parseCapabilityContainer(container))
    }
  }

  return { submodelId, capabilities }
}
