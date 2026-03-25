"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SUBMODEL_TEMPLATES } from '@/lib/templates'
import type { SubmodelTemplate } from '@/lib/templates'
import { Search, FileText, ChevronRight } from 'lucide-react'

interface TemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (submodel: ReturnType<SubmodelTemplate['buildSubmodel']>) => void
  idPrefix?: string
}

export function TemplatePicker({ open, onOpenChange, onSelect, idPrefix }: TemplatePickerProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SubmodelTemplate | null>(null)

  const filtered = SUBMODEL_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.idtaSpec.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleUse = () => {
    if (!selected) return
    const submodel = selected.buildSubmodel(idPrefix)
    onSelect(submodel)
    onOpenChange(false)
    setSelected(null)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Submodel from Template</DialogTitle>
          <DialogDescription>
            Pre-built IDTA-compliant submodel templates. Select one to add it to your AAS.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-80">
          <div className="space-y-2 pr-2">
            {filtered.map(template => (
              <div
                key={template.id}
                onClick={() => setSelected(template)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected?.id === template.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <FileText className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{template.name}</span>
                    <Badge variant="outline" className="text-xs">{template.idtaSpec}</Badge>
                    <Badge variant="secondary" className="text-xs">v{template.version}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                </div>
                <ChevronRight className={`h-4 w-4 shrink-0 mt-0.5 transition-colors ${
                  selected?.id === template.id ? 'text-blue-500' : 'text-muted-foreground'
                }`} />
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No templates match your search
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUse} disabled={!selected} className="bg-blue-600 text-white hover:bg-blue-700">
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
