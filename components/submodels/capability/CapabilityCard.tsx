import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ParsedCapability, ParsedCapabilityConstraint, ParsedCapabilityRelation, CapabilityRole } from '@/lib/types/capability'
import { PropertyValueRenderer } from './PropertyValueRenderer'

/** Palette of distinguishable colors for property–constraint links */
const LINK_COLORS = [
  { dot: 'bg-blue-500', border: 'border-blue-500/40', bg: 'bg-blue-500/10' },
  { dot: 'bg-amber-500', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
  { dot: 'bg-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
  { dot: 'bg-rose-500', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
  { dot: 'bg-violet-500', border: 'border-violet-500/40', bg: 'bg-violet-500/10' },
  { dot: 'bg-cyan-500', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  { dot: 'bg-orange-500', border: 'border-orange-500/40', bg: 'bg-orange-500/10' },
  { dot: 'bg-teal-500', border: 'border-teal-500/40', bg: 'bg-teal-500/10' },
]

/** Builds a map: propertyIdShort → color index, based on which properties have constraints */
function buildLinkColorMap(constraints: ParsedCapabilityConstraint[]): Map<string, number> {
  const map = new Map<string, number>()
  let colorIdx = 0
  for (const c of constraints) {
    if (c.constrainedPropertyIdShort && !map.has(c.constrainedPropertyIdShort)) {
      map.set(c.constrainedPropertyIdShort, colorIdx % LINK_COLORS.length)
      colorIdx++
    }
  }
  return map
}

function CapabilityRoleBadge({ role }: { role: CapabilityRole }) {
  const variant = role === 'Offered' ? 'default' : role === 'Required' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{role}</Badge>
}

function LinkDot({ colorIdx }: { colorIdx: number }) {
  const color = LINK_COLORS[colorIdx % LINK_COLORS.length]
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`} />
}

function CapabilityPropertySet({
  properties,
  linkColorMap,
}: {
  properties: ParsedCapability['properties']
  linkColorMap: Map<string, number>
}) {
  if (properties.length === 0) return null
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Properties</h4>
      <div className="grid gap-2">
        {properties.map((prop) => {
          const colorIdx = linkColorMap.get(prop.propertyIdShort)
          const hasLink = colorIdx !== undefined
          const color = hasLink ? LINK_COLORS[colorIdx % LINK_COLORS.length] : null
          return (
            <div
              key={prop.idShort}
              className={`flex items-center justify-between gap-2 text-sm rounded-lg px-2 py-1.5 border ${
                color ? `${color.bg} ${color.border}` : 'border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                {hasLink && <LinkDot colorIdx={colorIdx} />}
                <span className="text-muted-foreground">{prop.propertyIdShort}</span>
              </div>
              <PropertyValueRenderer data={prop.data} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface CapabilityCardProps {
  capability: ParsedCapability
}

export function CapabilityCard({ capability }: CapabilityCardProps) {
  const linkColorMap = buildLinkColorMap(capability.constraints)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{capability.containerIdShort}</CardTitle>
          <CapabilityRoleBadge role={capability.role} />
        </div>
        {capability.comment && (
          <CardDescription>{capability.comment}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <CapabilityPropertySet properties={capability.properties} linkColorMap={linkColorMap} />
        {capability.constraints.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Constraints</h4>
            <div className="grid gap-1.5">
              {capability.constraints.map((c) => {
                const colorIdx = c.constrainedPropertyIdShort
                  ? linkColorMap.get(c.constrainedPropertyIdShort)
                  : undefined
                const hasLink = colorIdx !== undefined
                const color = hasLink ? LINK_COLORS[colorIdx % LINK_COLORS.length] : null
                return (
                  <div
                    key={c.idShort}
                    className={`text-sm flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 border ${
                      color ? `${color.bg} ${color.border}` : 'border-transparent'
                    }`}
                  >
                    {hasLink && <LinkDot colorIdx={colorIdx} />}
                    <span className="font-medium">{c.idShort}</span>
                    <Badge variant="secondary">{c.constraintType}</Badge>
                    {c.value && <span>{c.value}</span>}
                    {c.conditionalType && (
                      <Badge variant="outline">{c.conditionalType}</Badge>
                    )}
                    {c.constrainedPropertyIdShort && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {c.constrainedPropertyIdShort}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {capability.composedOf.length > 0 && (
          <CapabilityRelationSet title="Composed Of" relations={capability.composedOf} />
        )}
        {capability.generalizedBy.length > 0 && (
          <CapabilityRelationSet title="Generalized By" relations={capability.generalizedBy} />
        )}
      </CardContent>
    </Card>
  )
}

function CapabilityRelationSet({ title, relations }: { title: string; relations: ParsedCapabilityRelation[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="grid gap-1.5">
        {relations.map((r) => (
          <div
            key={r.idShort}
            className="text-sm flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 border border-muted"
          >
            <span className="font-medium">{r.idShort}</span>
            <Badge variant="outline">{r.type}</Badge>
            {r.secondValue && (
              <span className="text-xs text-muted-foreground ml-auto">
                {r.secondValue}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
