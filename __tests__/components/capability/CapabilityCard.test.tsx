import { render, screen } from '@testing-library/react'
import { CapabilityCard } from '@/components/submodels/capability/CapabilityCard'
import type { ParsedCapability } from '@/lib/types/capability'

const mockCapability: ParsedCapability = {
  containerIdShort: 'ColdMetalTransfer',
  capabilityIdShort: 'ColdMetalTransfer',
  role: 'Offered',
  comment: 'CMT operates with low-heat input',
  properties: [
    {
      idShort: 'WireDiameterSizeContainer',
      propertyIdShort: 'WireDiameterSize',
      data: { type: 'range', min: '0.8', max: '1.6' },
    },
    {
      idShort: 'MaterialGroupContainer',
      propertyIdShort: 'MaterialGroup',
      data: { type: 'list', items: ['Aluminium Alloy', 'Steel Alloy'] },
    },
    {
      idShort: 'AntiCollisionSystemContainer',
      propertyIdShort: 'AntiCollisionSystem',
      data: { type: 'single', value: 'true' },
    },
  ],
  constraints: [],
  composedOf: [],
  generalizedBy: [],
}

describe('CapabilityCard', () => {
  beforeEach(() => {
    render(<CapabilityCard capability={mockCapability} />)
  })

  it('renders containerIdShort as the card title', () => {
    expect(screen.getByText('ColdMetalTransfer')).toBeInTheDocument()
  })

  it('renders the "Offered" role badge', () => {
    expect(screen.getByText('Offered')).toBeInTheDocument()
  })

  it('renders the comment text', () => {
    expect(screen.getByText('CMT operates with low-heat input')).toBeInTheDocument()
  })

  it('renders all 3 property labels', () => {
    expect(screen.getByText('WireDiameterSize')).toBeInTheDocument()
    expect(screen.getByText('MaterialGroup')).toBeInTheDocument()
    expect(screen.getByText('AntiCollisionSystem')).toBeInTheDocument()
  })

  it('renders the range value "0.8 → 1.6"', () => {
    expect(screen.getByText('0.8 → 1.6')).toBeInTheDocument()
  })

  it('renders list items as badges', () => {
    expect(screen.getByText('Aluminium Alloy')).toBeInTheDocument()
    expect(screen.getByText('Steel Alloy')).toBeInTheDocument()
  })
})

describe('CapabilityCard without comment', () => {
  it('renders without crashing when comment is undefined', () => {
    const capabilityWithoutComment: ParsedCapability = {
      ...mockCapability,
      comment: undefined,
    }
    const { container } = render(
      <CapabilityCard capability={capabilityWithoutComment} />
    )
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull()
    expect(screen.getByText('ColdMetalTransfer')).toBeInTheDocument()
    expect(screen.queryByText('CMT operates with low-heat input')).not.toBeInTheDocument()
  })
})

describe('CapabilityCard with ComposedOf relations', () => {
  it('renders Composed Of section with relation entries', () => {
    const capWithRelations: ParsedCapability = {
      ...mockCapability,
      composedOf: [
        { idShort: 'ComposedOfPreheating', type: 'IsComposedOf', firstValue: 'WeldingProcess', secondValue: 'Preheating' },
        { idShort: 'ComposedOfCooling', type: 'IsComposedOf', firstValue: 'WeldingProcess', secondValue: 'Cooling' },
      ],
    }
    render(<CapabilityCard capability={capWithRelations} />)
    expect(screen.getByText('Composed Of')).toBeInTheDocument()
    expect(screen.getByText('ComposedOfPreheating')).toBeInTheDocument()
    expect(screen.getByText('ComposedOfCooling')).toBeInTheDocument()
    expect(screen.getByText('Preheating')).toBeInTheDocument()
    expect(screen.getByText('Cooling')).toBeInTheDocument()
  })
})

describe('CapabilityCard with GeneralizedBy relations', () => {
  it('renders Generalized By section with relation entries', () => {
    const capWithGeneralized: ParsedCapability = {
      ...mockCapability,
      generalizedBy: [
        { idShort: 'GeneralizedByWelding', type: 'IsGeneralizedBy', firstValue: 'LaserWelding', secondValue: 'Welding' },
      ],
    }
    render(<CapabilityCard capability={capWithGeneralized} />)
    expect(screen.getByText('Generalized By')).toBeInTheDocument()
    expect(screen.getByText('GeneralizedByWelding')).toBeInTheDocument()
    expect(screen.getByText('Welding')).toBeInTheDocument()
  })
})

describe('CapabilityCard without relations', () => {
  it('does not render Composed Of or Generalized By when empty', () => {
    render(<CapabilityCard capability={mockCapability} />)
    expect(screen.queryByText('Composed Of')).not.toBeInTheDocument()
    expect(screen.queryByText('Generalized By')).not.toBeInTheDocument()
  })
})
