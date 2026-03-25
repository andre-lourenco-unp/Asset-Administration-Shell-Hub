import {
  createElement,
  generateCapabilityTemplateStructure,
  ALL_ELEMENT_TYPES,
  type CreateElementParams,
} from '@/lib/element-factory'
import { CAPABILITY_SEMANTIC_IDS, DEFAULT_ROLE_QUALIFIERS } from '@/lib/types/capability'

// ─── CapabilityName creation (Add Element) ──────────────────────────────

describe('createElement — CapabilityName', () => {
  const params: CreateElementParams = {
    type: 'CapabilityName',
    idShort: '',
    cardinality: 'One',
    description: '',
    semanticId: '',
  }

  it('uses "CapabilityName" as default idShort when empty', () => {
    const el = createElement(params)
    expect(el.idShort).toBe('CapabilityName')
  })

  it('maps to SubmodelElementCollection modelType', () => {
    const el = createElement(params)
    expect(el.modelType).toBe('SubmodelElementCollection')
  })

  it('sets default description', () => {
    const el = createElement(params)
    expect(el.description).toBe('A named capability container')
  })

  it('leaves semanticId undefined when empty', () => {
    const el = createElement(params)
    expect(el.semanticId).toBeUndefined()
  })

  it('creates exactly 4 default children', () => {
    const el = createElement(params)
    expect(el.children).toHaveLength(4)
  })

  it('first child is Capability with cardinality One', () => {
    const el = createElement(params)
    expect(el.children![0].modelType).toBe('Capability')
    expect(el.children![0].idShort).toBe('Capability1')
    expect(el.children![0].cardinality).toBe('One')
  })

  it('first child (Capability) has all 3 role qualifiers', () => {
    const el = createElement(params)
    const cap = el.children![0]
    expect(cap.qualifiers).toHaveLength(3)
    expect(cap.qualifiers![0].type).toBe('CapabilityRoleQualifier/Offered')
    expect(cap.qualifiers![0].value).toBe('false')
    expect(cap.qualifiers![1].type).toBe('CapabilityRoleQualifier/Required')
    expect(cap.qualifiers![1].value).toBe('false')
    expect(cap.qualifiers![2].type).toBe('CapabilityRoleQualifier/NotAssigned')
    expect(cap.qualifiers![2].value).toBe('true')
  })

  it('role qualifiers have correct semanticIds with version after element name', () => {
    const el = createElement(params)
    const qualifiers = el.children![0].qualifiers!
    expect(qualifiers[0].semanticId).toContain('CapabilityRoleQualifier/Offered/1/0')
    expect(qualifiers[1].semanticId).toContain('CapabilityRoleQualifier/Required/1/0')
    expect(qualifiers[2].semanticId).toContain('CapabilityRoleQualifier/NotAssigned/1/0')
  })

  it('second child is CapabilityComment MLP with cardinality ZeroToOne and no default value', () => {
    const el = createElement(params)
    expect(el.children![1].modelType).toBe('MultiLanguageProperty')
    expect(el.children![1].idShort).toBe('CapabilityComment')
    expect(el.children![1].cardinality).toBe('ZeroToOne')
    expect(el.children![1].value).toBeUndefined()
  })

  it('third child is PropertySet SMC with cardinality ZeroToMany and correct semanticId', () => {
    const el = createElement(params)
    expect(el.children![2].modelType).toBe('SubmodelElementCollection')
    expect(el.children![2].idShort).toBe('PropertySet')
    expect(el.children![2].cardinality).toBe('ZeroToMany')
    expect(el.children![2].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.PropertySet)
    expect(el.children![2].children).toEqual([])
  })

  it('fourth child is CapabilityRelations SMC with cardinality ZeroToOne and correct semanticId', () => {
    const el = createElement(params)
    expect(el.children![3].modelType).toBe('SubmodelElementCollection')
    expect(el.children![3].idShort).toBe('CapabilityRelations')
    expect(el.children![3].cardinality).toBe('ZeroToOne')
    expect(el.children![3].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.CapabilityRelations)
  })

  it('CapabilityRelations has ConstraintSet, ComposedOfSet, GeneralizedBySet', () => {
    const el = createElement(params)
    const relations = el.children![3]
    expect(relations.children).toHaveLength(3)
    expect(relations.children![0].idShort).toBe('ConstraintSet')
    expect(relations.children![1].idShort).toBe('ComposedOfSet')
    expect(relations.children![2].idShort).toBe('GeneralizedBySet')
  })

  it('respects custom idShort', () => {
    const el = createElement({ ...params, idShort: 'Drilling' })
    expect(el.idShort).toBe('Drilling')
  })

  it('respects custom semanticId', () => {
    const el = createElement({ ...params, semanticId: 'urn:custom:id' })
    expect(el.semanticId).toBe('urn:custom:id')
  })
})

// ─── Semantic ID path format ────────────────────────────────────────────

describe('Semantic ID path format', () => {
  it('CapabilitySet uses version after element name: .../CapabilitySet/1/0', () => {
    expect(CAPABILITY_SEMANTIC_IDS.CapabilitySet).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/CapabilitySet/1/0'
    )
  })

  it('PropertySet uses version after element name: .../PropertySet/1/0', () => {
    expect(CAPABILITY_SEMANTIC_IDS.PropertySet).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/PropertySet/1/0'
    )
  })

  it('CapabilityRelations uses version after element name: .../CapabilityRelations/1/0', () => {
    expect(CAPABILITY_SEMANTIC_IDS.CapabilityRelations).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/CapabilityRelations/1/0'
    )
  })

  it('ConstraintSet uses version after element name: .../ConstraintSet/1/0', () => {
    expect(CAPABILITY_SEMANTIC_IDS.ConstraintSet).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/ConstraintSet/1/0'
    )
  })

  it('Submodel semantic ID uses canonical format: .../1/0/Submodel', () => {
    expect(CAPABILITY_SEMANTIC_IDS.Submodel).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/1/0/Submodel'
    )
  })
})

// ─── Role qualifiers ────────────────────────────────────────────────────

describe('DEFAULT_ROLE_QUALIFIERS', () => {
  it('has exactly 3 qualifiers', () => {
    expect(DEFAULT_ROLE_QUALIFIERS).toHaveLength(3)
  })

  it('exactly one qualifier has value "true" (NotAssigned)', () => {
    const trueQualifiers = DEFAULT_ROLE_QUALIFIERS.filter(q => q.value === 'true')
    expect(trueQualifiers).toHaveLength(1)
    expect(trueQualifiers[0].type).toContain('NotAssigned')
  })

  it('all qualifiers have valueType xs:boolean', () => {
    for (const q of DEFAULT_ROLE_QUALIFIERS) {
      expect(q.valueType).toBe('xs:boolean')
    }
  })

  it('all qualifiers have semanticIds', () => {
    for (const q of DEFAULT_ROLE_QUALIFIERS) {
      expect(q.semanticId).toBeTruthy()
    }
  })
})

// ─── Standalone Capability element gets qualifiers too ──────────────────

describe('createElement — standalone Capability', () => {
  it('injects 3 role qualifiers on bare Capability', () => {
    const el = createElement({
      type: 'Capability',
      idShort: 'TestCap',
      cardinality: 'One',
      description: '',
      semanticId: '',
    })
    expect(el.qualifiers).toHaveLength(3)
    expect(el.qualifiers![2].type).toContain('NotAssigned')
    expect(el.qualifiers![2].value).toBe('true')
  })
})

// ─── Standard element types ─────────────────────────────────────────────

describe('createElement — standard types', () => {
  const base = {
    idShort: 'TestEl',
    cardinality: 'ZeroToOne' as const,
    description: '',
    semanticId: '',
  }

  it('Property has empty value and valueType', () => {
    const el = createElement({ ...base, type: 'Property' })
    expect(el.modelType).toBe('Property')
    expect(el.value).toBe('')
    expect(el.valueType).toBe('string')
  })

  it('MultiLanguageProperty has { en: "" }', () => {
    const el = createElement({ ...base, type: 'MultiLanguageProperty' })
    expect(el.value).toEqual({ en: '' })
  })

  it('SubmodelElementCollection has empty children', () => {
    const el = createElement({ ...base, type: 'SubmodelElementCollection' })
    expect(el.children).toEqual([])
  })

  it('SubmodelElementList has empty children', () => {
    const el = createElement({ ...base, type: 'SubmodelElementList' })
    expect(el.children).toEqual([])
  })

  it('File has empty value and contentType', () => {
    const el = createElement({ ...base, type: 'File' })
    expect(el.value).toBe('')
    expect(el.contentType).toBe('')
  })

  it('Blob has application/octet-stream contentType', () => {
    const el = createElement({ ...base, type: 'Blob' })
    expect(el.contentType).toBe('application/octet-stream')
  })

  it('Range has min and max', () => {
    const el = createElement({ ...base, type: 'Range' })
    expect(el.min).toBe('')
    expect(el.max).toBe('')
    expect(el.valueType).toBe('string')
  })

  it('ReferenceElement has ModelReference value', () => {
    const el = createElement({ ...base, type: 'ReferenceElement' })
    expect(el.value).toEqual({ type: 'ModelReference', keys: [] })
  })

  it('Entity has entityType and children', () => {
    const el = createElement({ ...base, type: 'Entity' })
    expect(el.entityType).toBe('CoManagedEntity')
    expect(el.children).toEqual([])
  })

  it('Operation has input/output arrays', () => {
    const el = createElement({ ...base, type: 'Operation' })
    expect(el.inputVariables).toEqual([])
    expect(el.outputVariables).toEqual([])
    expect(el.inoutputVariables).toEqual([])
  })

  it('BasicEventElement has observed reference', () => {
    const el = createElement({ ...base, type: 'BasicEventElement' })
    expect(el.observed).toEqual({ type: 'ModelReference', keys: [] })
  })

  it('RelationshipElement has first and second references', () => {
    const el = createElement({ ...base, type: 'RelationshipElement' })
    expect(el.first).toEqual({ type: 'ModelReference', keys: [] })
    expect(el.second).toEqual({ type: 'ModelReference', keys: [] })
  })

  it('AnnotatedRelationshipElement has first and second references', () => {
    const el = createElement({ ...base, type: 'AnnotatedRelationshipElement' })
    expect(el.first).toEqual({ type: 'ModelReference', keys: [] })
    expect(el.second).toEqual({ type: 'ModelReference', keys: [] })
  })
})

// ─── generateCapabilityTemplateStructure ────────────────────────────────

describe('generateCapabilityTemplateStructure', () => {
  it('returns an array with one CapabilitySet element', () => {
    const result = generateCapabilityTemplateStructure()
    expect(result).toHaveLength(1)
    expect(result[0].idShort).toBe('CapabilitySet')
  })

  it('CapabilitySet has cardinality OneToMany (1..*)', () => {
    const result = generateCapabilityTemplateStructure()
    expect(result[0].cardinality).toBe('OneToMany')
  })

  it('CapabilitySet has correct semanticId with version after element name', () => {
    const result = generateCapabilityTemplateStructure()
    expect(result[0].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.CapabilitySet)
  })

  it('CapabilitySet has one child: CapabilityName SMC', () => {
    const result = generateCapabilityTemplateStructure()
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].idShort).toBe('CapabilityName')
    expect(result[0].children![0].modelType).toBe('SubmodelElementCollection')
  })

  it('CapabilityName has 4 inner children', () => {
    const result = generateCapabilityTemplateStructure()
    const capName = result[0].children![0]
    expect(capName.children).toHaveLength(4)
  })

  it('inner Capability has 3 role qualifiers', () => {
    const inner = generateCapabilityTemplateStructure()[0].children![0].children!
    expect(inner[0].qualifiers).toHaveLength(3)
  })

  it('inner PropertySet uses correct semanticId path', () => {
    const inner = generateCapabilityTemplateStructure()[0].children![0].children!
    expect(inner[2].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.PropertySet)
  })

  it('inner CapabilityRelations uses correct semanticId path', () => {
    const inner = generateCapabilityTemplateStructure()[0].children![0].children!
    expect(inner[3].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.CapabilityRelations)
  })

  it('inner CapabilityRelations has ConstraintSet, ComposedOfSet, GeneralizedBySet', () => {
    const inner = generateCapabilityTemplateStructure()[0].children![0].children!
    const relations = inner[3]
    expect(relations.children).toHaveLength(3)
    expect(relations.children![0].idShort).toBe('ConstraintSet')
    expect(relations.children![1].idShort).toBe('ComposedOfSet')
    expect(relations.children![2].idShort).toBe('GeneralizedBySet')
  })

  it('inner children match expected types', () => {
    const inner = generateCapabilityTemplateStructure()[0].children![0].children!
    expect(inner[0].modelType).toBe('Capability')
    expect(inner[1].modelType).toBe('MultiLanguageProperty')
    expect(inner[2].idShort).toBe('PropertySet')
    expect(inner[3].idShort).toBe('CapabilityRelations')
  })
})

// ─── ALL_ELEMENT_TYPES ──────────────────────────────────────────────────

describe('ALL_ELEMENT_TYPES', () => {
  it('includes CapabilityName', () => {
    expect(ALL_ELEMENT_TYPES.find(t => t.value === 'CapabilityName')).toBeDefined()
  })

  it('does NOT include CapabilityContainer', () => {
    expect(ALL_ELEMENT_TYPES.find(t => t.value === 'CapabilityContainer')).toBeUndefined()
  })

  it('does NOT include CapabilitySet', () => {
    expect(ALL_ELEMENT_TYPES.find(t => t.value === 'CapabilitySet')).toBeUndefined()
  })

  it('includes all standard AAS types', () => {
    const standardTypes = [
      'Property', 'MultiLanguageProperty', 'SubmodelElementCollection',
      'SubmodelElementList', 'File', 'Blob', 'Range', 'ReferenceElement',
      'Entity', 'Capability', 'Operation', 'BasicEventElement',
      'RelationshipElement', 'AnnotatedRelationshipElement',
    ]
    for (const t of standardTypes) {
      expect(ALL_ELEMENT_TYPES.find(e => e.value === t)).toBeDefined()
    }
  })

  it('has 15 total entries', () => {
    expect(ALL_ELEMENT_TYPES).toHaveLength(15)
  })

  it('each entry has value, label, and description', () => {
    for (const entry of ALL_ELEMENT_TYPES) {
      expect(entry.value).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  })
})
