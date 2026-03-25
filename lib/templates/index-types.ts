import type { SubmodelInfo } from '@/lib/types'

export interface SubmodelTemplate {
  id: string
  name: string
  idtaSpec: string
  description: string
  version: string
  buildSubmodel: (idPrefix?: string) => SubmodelInfo
}
