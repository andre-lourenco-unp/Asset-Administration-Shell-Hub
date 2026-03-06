"use client"

import * as React from "react"
import { AlertCircle, AlertTriangle, Info, CheckCircle, Wrench, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AlertType, ValidationAlert, ALERT_COLORS, countAlertsByType, groupAlertsByPath, countFixableAlerts } from "@/lib/validation-types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface ValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alerts: ValidationAlert[]
  isFixing?: boolean
  onFix?: () => void
  onGoToPath?: (path: string) => void
  title?: string
}

export function ValidationDialog({
  open,
  onOpenChange,
  alerts,
  isFixing = false,
  onFix,
  onGoToPath,
  title = "Validation Results"
}: ValidationDialogProps) {
  const counts = countAlertsByType(alerts)
  const fixableCount = countFixableAlerts(alerts)
  const isValid = counts.errors === 0

  const errors = alerts.filter(a => a.type === AlertType.ERROR)
  const warnings = alerts.filter(a => a.type === AlertType.WARNING)
  const infos = alerts.filter(a => a.type === AlertType.INFO)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isValid ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {isFixing ? (
              <span className="flex items-center gap-2 text-[#61caf3]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying fixes to your model...
              </span>
            ) : isValid ? (
              "Your model passes all validation checks and is ready for export."
            ) : (
              `Found ${counts.total} issue${counts.total !== 1 ? 's' : ''} that need${counts.total === 1 ? 's' : ''} attention.`
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 py-2">
          {counts.errors > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="w-3 h-3" />
              {counts.errors} Error{counts.errors !== 1 ? 's' : ''}
            </Badge>
          )}
          {counts.warnings > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {counts.warnings} Warning{counts.warnings !== 1 ? 's' : ''}
            </Badge>
          )}
          {counts.info > 0 && (
            <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 dark:text-blue-400">
              <Info className="w-3 h-3" />
              {counts.info} Info
            </Badge>
          )}
          {isValid && (
            <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400">
              <CheckCircle className="w-3 h-3" />
              All checks passed
            </Badge>
          )}
        </div>

        {/* Alert sections */}
        {!isValid && (
          <div className={cn("flex-1 min-h-0 overflow-hidden relative", isFixing && "opacity-50 pointer-events-none")}>
            {isFixing && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10 rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-[#61caf3]" />
                  <span className="text-sm font-medium text-[#61caf3]">Applying fixes...</span>
                </div>
              </div>
            )}
            <ScrollArea className="h-full max-h-[400px]">
              <div className="space-y-4 pr-4">
              {/* Errors section */}
              {errors.length > 0 && (
                <AlertSection
                  title="Errors"
                  type={AlertType.ERROR}
                  alerts={errors}
                  onGoToPath={onGoToPath}
                  defaultOpen={true}
                />
              )}

              {/* Warnings section */}
              {warnings.length > 0 && (
                <AlertSection
                  title="Warnings"
                  type={AlertType.WARNING}
                  alerts={warnings}
                  onGoToPath={onGoToPath}
                  defaultOpen={errors.length === 0}
                />
              )}

              {/* Info section */}
              {infos.length > 0 && (
                <AlertSection
                  title="Suggestions"
                  type={AlertType.INFO}
                  alerts={infos}
                  onGoToPath={onGoToPath}
                  defaultOpen={errors.length === 0 && warnings.length === 0}
                />
              )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          {!isValid && onFix && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
              <Wrench className="w-4 h-4" />
              {fixableCount > 0 ? (
                <span>{fixableCount} issue{fixableCount !== 1 ? 's' : ''} can be auto-fixed</span>
              ) : (
                <span>Manual fixes required</span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {isValid ? "Done" : "Close"}
            </Button>
            {!isValid && onFix && (
              <Button
                onClick={onFix}
                disabled={isFixing}
                className="bg-[#61caf3] hover:bg-[#4db6e6] text-white gap-2 min-w-[140px]"
              >
                {isFixing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fixing Issues...
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4" />
                    Fix Issues
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface AlertSectionProps {
  title: string
  type: AlertType
  alerts: ValidationAlert[]
  onGoToPath?: (path: string) => void
  defaultOpen?: boolean
}

function AlertSection({ title, type, alerts, onGoToPath, defaultOpen = false }: AlertSectionProps) {
  const colors = ALERT_COLORS[type]
  const Icon = type === AlertType.ERROR ? AlertCircle : type === AlertType.WARNING ? AlertTriangle : Info
  const grouped = groupAlertsByPath(alerts)

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className={cn(
        "flex items-center justify-between w-full p-3 rounded-lg border transition-colors",
        colors.bg, colors.border, colors.text,
        "hover:opacity-90"
      )}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="ml-1">
            {alerts.length}
          </Badge>
        </div>
        <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(
        "border-x border-b rounded-b-lg p-3 space-y-2 overflow-hidden",
        colors.border
      )}>
        {Array.from(grouped.entries()).map(([path, pathAlerts], idx) => (
          <div
            key={idx}
            className={cn(
              "p-3 rounded-lg border bg-white dark:bg-gray-900",
              colors.border
            )}
          >
            {/* Path header */}
            {path && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {path}
                </span>
                {onGoToPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onGoToPath(path)}
                    className="h-6 px-2 text-xs gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Go to
                  </Button>
                )}
              </div>
            )}
            {/* Alert messages */}
            <div className="space-y-2">
              {pathAlerts.map((alert, alertIdx) => (
                <div key={alertIdx} className={cn("text-sm", colors.text)}>
                  <p>{alert.description}</p>
                  {alert.hint && (
                    <p className="text-xs opacity-70 mt-1 pl-2 border-l-2 border-current">
                      {alert.hint}
                    </p>
                  )}
                  {alert.line && (
                    <p className="text-xs opacity-50 mt-1">
                      Line {alert.line}
                    </p>
                  )}
                  {alert.fixable && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      Auto-fixable
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Compact inline validation summary for headers
interface ValidationSummaryProps {
  alerts: ValidationAlert[]
  className?: string
}

export function ValidationSummary({ alerts, className }: ValidationSummaryProps) {
  const counts = countAlertsByType(alerts)

  if (counts.total === 0) {
    return (
      <div className={cn("flex items-center gap-1 text-green-600 dark:text-green-400", className)}>
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm">Valid</span>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {counts.errors > 0 && (
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{counts.errors}</span>
        </div>
      )}
      {counts.warnings > 0 && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{counts.warnings}</span>
        </div>
      )}
      {counts.info > 0 && (
        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <Info className="w-4 h-4" />
          <span className="text-sm">{counts.info}</span>
        </div>
      )}
    </div>
  )
}
