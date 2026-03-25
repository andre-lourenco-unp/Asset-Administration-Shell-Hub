export type { SubmodelTemplate } from './index-types'
import type { SubmodelTemplate } from './index-types'
import { TECHNICAL_DATA_TEMPLATE } from './technical-data'
import { NAMEPLATE_TEMPLATE } from './nameplate'
import { CARBON_FOOTPRINT_TEMPLATE } from './carbon-footprint'
import { HANDOVER_DOCUMENTATION_TEMPLATE } from './handover-documentation'

export const SUBMODEL_TEMPLATES: SubmodelTemplate[] = [
  TECHNICAL_DATA_TEMPLATE,
  NAMEPLATE_TEMPLATE,
  CARBON_FOOTPRINT_TEMPLATE,
  HANDOVER_DOCUMENTATION_TEMPLATE,
]

export function getTemplateById(id: string): SubmodelTemplate | undefined {
  return SUBMODEL_TEMPLATES.find(t => t.id === id)
}
