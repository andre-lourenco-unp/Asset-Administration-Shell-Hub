/**
 * Tests for new features:
 * - ComposedOfSet / GeneralizedBySet parsing
 * - Updated element factory
 * - Constraint factory with PropertyConstraintContainer
 */
import { DOMParser } from '@xmldom/xmldom'
import { parseCapabilitySubmodel } from '@/lib/parsers/capability-parser'
import {
  createElement,
  createPropertyConstraintContainer,
  generateCapabilityTemplateStructure,
} from '@/lib/element-factory'
import { CAPABILITY_SEMANTIC_IDS } from '@/lib/types/capability'

const AAS_NS = 'https://admin-shell.io/aas/3/0'
const CAP_SET_SEM_ID = CAPABILITY_SEMANTIC_IDS.CapabilitySet
const CAP_SET_SEMANTIC_XML = `<semanticId><keys><key><type>GlobalReference</type><value>${CAP_SET_SEM_ID}</value></key></keys></semanticId>`

function getRoot(xml: string): Element {
  return new DOMParser().parseFromString(xml, 'text/xml').documentElement
}

// ─── ComposedOfSet Parsing ──────────────────────────────────────────────

describe('parseCapabilitySubmodel — ComposedOfSet', () => {
  const xml = `
    <submodel xmlns="${AAS_NS}">
      <id>urn:example:sm:composed</id>
      <submodelElements>
        <submodelElementCollection>
          <idShort>CapabilitySet</idShort>
          ${CAP_SET_SEMANTIC_XML}
          <value>
            <submodelElementCollection>
              <idShort>WeldingProcess</idShort>
              <value>
                <capability><idShort>WeldingProcess</idShort></capability>
                <submodelElementCollection>
                  <idShort>CapabilityRelations</idShort>
                  <value>
                    <submodelElementCollection>
                      <idShort>ComposedOfSet</idShort>
                      <value>
                        <relationshipElement>
                          <idShort>ComposedOfPreheating</idShort>
                          <first>
                            <keys>
                              <key><type>Capability</type><value>WeldingProcess</value></key>
                            </keys>
                          </first>
                          <second>
                            <keys>
                              <key><type>Capability</type><value>Preheating</value></key>
                            </keys>
                          </second>
                        </relationshipElement>
                        <relationshipElement>
                          <idShort>ComposedOfCooling</idShort>
                          <first>
                            <keys>
                              <key><type>Capability</type><value>WeldingProcess</value></key>
                            </keys>
                          </first>
                          <second>
                            <keys>
                              <key><type>Capability</type><value>Cooling</value></key>
                            </keys>
                          </second>
                        </relationshipElement>
                      </value>
                    </submodelElementCollection>
                  </value>
                </submodelElementCollection>
              </value>
            </submodelElementCollection>
          </value>
        </submodelElementCollection>
      </submodelElements>
    </submodel>
  `

  it('parses ComposedOfSet with 2 relations', () => {
    const result = parseCapabilitySubmodel(getRoot(xml))
    expect(result.capabilities).toHaveLength(1)
    expect(result.capabilities[0].composedOf).toHaveLength(2)
  })

  it('extracts relation idShorts', () => {
    const result = parseCapabilitySubmodel(getRoot(xml))
    const composed = result.capabilities[0].composedOf
    expect(composed[0].idShort).toBe('ComposedOfPreheating')
    expect(composed[1].idShort).toBe('ComposedOfCooling')
  })

  it('extracts first and second reference values', () => {
    const result = parseCapabilitySubmodel(getRoot(xml))
    const rel = result.capabilities[0].composedOf[0]
    expect(rel.firstValue).toBe('WeldingProcess')
    expect(rel.secondValue).toBe('Preheating')
    expect(rel.type).toBe('IsComposedOf')
  })

  it('returns empty composedOf when ComposedOfSet is absent', () => {
    const simpleXml = `
      <submodel xmlns="${AAS_NS}">
        <id>urn:example:sm:simple</id>
        <submodelElements>
          <submodelElementCollection>
            <idShort>CapabilitySet</idShort>
            ${CAP_SET_SEMANTIC_XML}
            <value>
              <submodelElementCollection>
                <idShort>Cap</idShort>
                <value>
                  <capability><idShort>Cap</idShort></capability>
                </value>
              </submodelElementCollection>
            </value>
          </submodelElementCollection>
        </submodelElements>
      </submodel>
    `
    const result = parseCapabilitySubmodel(getRoot(simpleXml))
    expect(result.capabilities[0].composedOf).toEqual([])
    expect(result.capabilities[0].generalizedBy).toEqual([])
  })
})

// ─── GeneralizedBySet Parsing ───────────────────────────────────────────

describe('parseCapabilitySubmodel — GeneralizedBySet', () => {
  const xml = `
    <submodel xmlns="${AAS_NS}">
      <id>urn:example:sm:generalized</id>
      <submodelElements>
        <submodelElementCollection>
          <idShort>CapabilitySet</idShort>
          ${CAP_SET_SEMANTIC_XML}
          <value>
            <submodelElementCollection>
              <idShort>LaserWelding</idShort>
              <value>
                <capability><idShort>LaserWelding</idShort></capability>
                <submodelElementCollection>
                  <idShort>CapabilityRelations</idShort>
                  <value>
                    <submodelElementCollection>
                      <idShort>GeneralizedBySet</idShort>
                      <value>
                        <relationshipElement>
                          <idShort>GeneralizedByWelding</idShort>
                          <first>
                            <keys>
                              <key><type>Capability</type><value>LaserWelding</value></key>
                            </keys>
                          </first>
                          <second>
                            <keys>
                              <key><type>Capability</type><value>Welding</value></key>
                            </keys>
                          </second>
                        </relationshipElement>
                      </value>
                    </submodelElementCollection>
                  </value>
                </submodelElementCollection>
              </value>
            </submodelElementCollection>
          </value>
        </submodelElementCollection>
      </submodelElements>
    </submodel>
  `

  it('parses GeneralizedBySet with 1 relation', () => {
    const result = parseCapabilitySubmodel(getRoot(xml))
    expect(result.capabilities[0].generalizedBy).toHaveLength(1)
  })

  it('extracts correct type and references', () => {
    const result = parseCapabilitySubmodel(getRoot(xml))
    const rel = result.capabilities[0].generalizedBy[0]
    expect(rel.type).toBe('IsGeneralizedBy')
    expect(rel.idShort).toBe('GeneralizedByWelding')
    expect(rel.firstValue).toBe('LaserWelding')
    expect(rel.secondValue).toBe('Welding')
  })
})

// ─── Element Factory — ComposedOfSet/GeneralizedBySet ────────────────────

describe('generateCapabilityTemplateStructure — CapabilityRelations children', () => {
  it('has 3 child sets: ConstraintSet, ComposedOfSet, GeneralizedBySet', () => {
    const template = generateCapabilityTemplateStructure()
    const capabilityName = template[0].children![0]
    const relations = capabilityName.children![3]
    expect(relations.idShort).toBe('CapabilityRelations')
    expect(relations.children).toHaveLength(3)
    expect(relations.children![0].idShort).toBe('ConstraintSet')
    expect(relations.children![1].idShort).toBe('ComposedOfSet')
    expect(relations.children![2].idShort).toBe('GeneralizedBySet')
  })

  it('ConstraintSet has correct semanticId', () => {
    const template = generateCapabilityTemplateStructure()
    const relations = template[0].children![0].children![3]
    expect(relations.children![0].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.ConstraintSet)
  })

  it('ComposedOfSet has correct semanticId', () => {
    const template = generateCapabilityTemplateStructure()
    const relations = template[0].children![0].children![3]
    expect(relations.children![1].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.ComposedOfSet)
  })

  it('GeneralizedBySet has correct semanticId', () => {
    const template = generateCapabilityTemplateStructure()
    const relations = template[0].children![0].children![3]
    expect(relations.children![2].semanticId).toBe(CAPABILITY_SEMANTIC_IDS.GeneralizedBySet)
  })
})

// ─── createPropertyConstraintContainer ──────────────────────────────────

describe('createPropertyConstraintContainer', () => {
  const constraint = createPropertyConstraintContainer({
    idShort: 'MinPowerConstraint',
    constraintType: 'BasicConstraint',
    value: 'LaserPower >= 1000',
    conditionalType: 'Precondition',
    targetPropertyPath: 'LaserPower',
    constraintElementPath: 'MinPowerConstraint',
  })

  it('creates an SMC with correct idShort', () => {
    expect(constraint.idShort).toBe('MinPowerConstraint')
    expect(constraint.modelType).toBe('SubmodelElementCollection')
  })

  it('has PropertyConstraintContainer semanticId', () => {
    expect(constraint.semanticId).toBe(CAPABILITY_SEMANTIC_IDS.PropertyConstraintContainer)
  })

  it('has 4 children: constraint value, ConstraintType, ConditionalType, Relations', () => {
    expect(constraint.children).toHaveLength(4)
    expect(constraint.children![0].idShort).toBe('BasicConstraint')
    expect(constraint.children![1].idShort).toBe('ConstraintType')
    expect(constraint.children![2].idShort).toBe('PropertyConditionalType')
    expect(constraint.children![3].idShort).toBe('ConstraintPropertyRelations')
  })

  it('constraint value property has correct value', () => {
    expect(constraint.children![0].value).toBe('LaserPower >= 1000')
    expect(constraint.children![0].valueType).toBe('xs:string')
  })

  it('ConstraintType property has correct value', () => {
    expect(constraint.children![1].value).toBe('BasicConstraint')
  })

  it('PropertyConditionalType has correct value', () => {
    expect(constraint.children![2].value).toBe('Precondition')
  })

  it('ConstraintPropertyRelations contains ConstraintHasProperty RelationshipElement', () => {
    const relations = constraint.children![3]
    expect(relations.children).toHaveLength(1)
    const rel = relations.children![0]
    expect(rel.idShort).toBe('ConstraintHasProperty')
    expect(rel.modelType).toBe('RelationshipElement')
    expect(rel.semanticId).toBe(CAPABILITY_SEMANTIC_IDS.ConstraintHasProperty)
  })

  it('ConstraintHasProperty first references the constraint, second the property', () => {
    const rel = constraint.children![3].children![0]
    expect(rel.first.keys[0].value).toBe('MinPowerConstraint')
    expect(rel.second.keys[0].value).toBe('LaserPower')
  })
})

// ─── createElement — RelationshipElement ────────────────────────────────

describe('createElement — RelationshipElement', () => {
  it('creates with first and second references', () => {
    const el = createElement({
      type: 'RelationshipElement',
      idShort: 'TestRel',
      cardinality: 'ZeroToOne',
      description: '',
      semanticId: '',
    })
    expect(el.modelType).toBe('RelationshipElement')
    expect(el.first).toEqual({ type: 'ModelReference', keys: [] })
    expect(el.second).toEqual({ type: 'ModelReference', keys: [] })
  })
})

describe('createElement — AnnotatedRelationshipElement', () => {
  it('creates with first and second references', () => {
    const el = createElement({
      type: 'AnnotatedRelationshipElement',
      idShort: 'TestAnnRel',
      cardinality: 'ZeroToOne',
      description: '',
      semanticId: '',
    })
    expect(el.modelType).toBe('AnnotatedRelationshipElement')
    expect(el.first).toEqual({ type: 'ModelReference', keys: [] })
    expect(el.second).toEqual({ type: 'ModelReference', keys: [] })
  })
})

// ─── Semantic IDs for new types ─────────────────────────────────────────

describe('CAPABILITY_SEMANTIC_IDS', () => {
  it('includes ComposedOfSet', () => {
    expect(CAPABILITY_SEMANTIC_IDS.ComposedOfSet).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/ComposedOfSet/1/0'
    )
  })

  it('includes GeneralizedBySet', () => {
    expect(CAPABILITY_SEMANTIC_IDS.GeneralizedBySet).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/GeneralizedBySet/1/0'
    )
  })

  it('includes IsComposedOf', () => {
    expect(CAPABILITY_SEMANTIC_IDS.IsComposedOf).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/IsComposedOf/1/0'
    )
  })

  it('includes IsGeneralizedBy', () => {
    expect(CAPABILITY_SEMANTIC_IDS.IsGeneralizedBy).toBe(
      'https://admin-shell.io/idta/CapabilityDescription/IsGeneralizedBy/1/0'
    )
  })
})
