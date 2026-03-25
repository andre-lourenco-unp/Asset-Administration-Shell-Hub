"use client"

import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { diffXml, summarizeDiff } from '@/lib/xml-diff'
import { cn } from '@/lib/utils'

interface XmlDiffViewerProps {
  xmlA: string
  xmlB: string
  labelA?: string
  labelB?: string
  maxLines?: number
}

export function XmlDiffViewer({ xmlA, xmlB, labelA = 'Original', labelB = 'Modified', maxLines = 500 }: XmlDiffViewerProps) {
  const diff = useMemo(() => diffXml(xmlA, xmlB), [xmlA, xmlB])
  const summary = summarizeDiff(diff)
  const visibleLines = diff.lines.slice(0, maxLines)

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{labelA} → {labelB}</span>
          <span className="text-sm text-muted-foreground">{summary}</span>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-green-500 text-white text-xs">+{diff.addedCount}</Badge>
          <Badge className="bg-red-500 text-white text-xs">-{diff.removedCount}</Badge>
        </div>
      </div>
      <ScrollArea className="h-96">
        <div className="font-mono text-xs">
          {visibleLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-start px-2 py-0.5',
                line.type === 'added' && 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200',
                line.type === 'removed' && 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 line-through opacity-70',
                line.type === 'unchanged' && 'text-muted-foreground'
              )}
            >
              <span className="w-5 shrink-0 text-muted-foreground select-none">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className="w-8 shrink-0 text-muted-foreground select-none text-right pr-2">{line.lineNumber}</span>
              <span className="flex-1 whitespace-pre-wrap break-all">{line.content}</span>
            </div>
          ))}
          {diff.lines.length > maxLines && (
            <div className="p-2 text-center text-muted-foreground text-xs">
              {diff.lines.length - maxLines} more lines not shown
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
