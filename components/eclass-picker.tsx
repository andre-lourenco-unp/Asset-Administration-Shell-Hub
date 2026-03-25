"use client"

import { useState, useCallback } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { searchEClass } from '@/lib/eclass/search'
import { isValidIrdi } from '@/lib/eclass/irdi'
import type { EClassProperty } from '@/lib/eclass/types'
import { Search, CheckCircle2, AlertCircle } from 'lucide-react'

interface EClassPickerProps {
  value: string
  onChange: (irdi: string, property?: EClassProperty) => void
  placeholder?: string
}

export function EClassPicker({ value, onChange, placeholder = 'Enter IRDI or search...' }: EClassPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const results = searchEClass(search, 8)
  const isValid = !value || isValidIrdi(value)

  const handleSelect = useCallback((prop: EClassProperty) => {
    onChange(prop.irdi, prop)
    setOpen(false)
    setSearch('')
  }, [onChange])

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`pr-8 font-mono text-xs ${!isValid ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
          {value && (
            <div className="absolute right-2 top-2.5">
              {isValid
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <AlertCircle className="h-4 w-4 text-red-500" />
              }
            </div>
          )}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Search className="h-4 w-4 mr-1" />
              eCLASS
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search eCLASS properties..."
                  className="pl-8"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <ScrollArea className="max-h-72">
              {results.length === 0 && search && (
                <div className="p-4 text-center text-sm text-muted-foreground">No properties found</div>
              )}
              {!search && (
                <div className="p-4 text-center text-sm text-muted-foreground">Type to search eCLASS properties</div>
              )}
              {results.map(({ property }) => (
                <div
                  key={property.irdi}
                  onClick={() => handleSelect(property)}
                  className="flex flex-col gap-1 p-3 border-b cursor-pointer hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{property.preferredName}</span>
                    {property.unit && <Badge variant="outline" className="text-xs shrink-0">{property.unit}</Badge>}
                  </div>
                  <code className="text-xs text-muted-foreground">{property.irdi}</code>
                  <p className="text-xs text-muted-foreground line-clamp-2">{property.definition}</p>
                </div>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
      {value && !isValid && (
        <p className="text-xs text-red-500">Invalid IRDI format. Expected: 0173-1#XX-XXXXXX#XXX</p>
      )}
    </div>
  )
}
