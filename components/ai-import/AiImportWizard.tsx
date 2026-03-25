"use client"

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Sparkles, Upload, AlertCircle, CheckCircle2, AlertTriangle, FileText, ChevronRight, Loader2 } from 'lucide-react'
import type { ExtractionResult, ExtractedElement } from '@/lib/ai/response-parser'
import { extractionResultToSubmodels } from '@/lib/ai/response-parser'

type Step = 'upload' | 'processing' | 'review'

interface AiImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (submodels: any[], assetInfo: { idShort: string; id: string; description: string }) => void
}

function ConfidenceBadge({ tier }: { tier: string }) {
  if (tier === 'high') return <Badge className="bg-green-500 text-white text-xs">High confidence</Badge>
  if (tier === 'medium') return <Badge className="bg-yellow-500 text-white text-xs">Review needed</Badge>
  return <Badge className="bg-red-500 text-white text-xs">Low confidence</Badge>
}

function ElementRow({ el }: { el: ExtractedElement }) {
  return (
    <div className={`flex items-start gap-3 p-2 rounded border text-sm ${
      el.tier === 'high' ? 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800' :
      el.tier === 'medium' ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800' :
      'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium">{el.idShort}</span>
          <Badge variant="outline" className="text-xs">{el.modelType}</Badge>
          {el.unit && <Badge variant="outline" className="text-xs">{el.unit}</Badge>}
          <ConfidenceBadge tier={el.tier} />
        </div>
        {el.value && <p className="text-xs text-muted-foreground mt-1">Value: {el.value}</p>}
        {el.semanticIdIrdi && <p className="text-xs text-muted-foreground font-mono">{el.semanticIdIrdi}</p>}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{el.confidence}%</span>
    </div>
  )
}

export function AiImportWizard({ open, onOpenChange, onImport }: AiImportWizardProps) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [idPrefix, setIdPrefix] = useState('urn:extracted')
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setStep('upload'); setFile(null); setResult(null); setProgress(0); setError(null) }

  const handleExtract = async () => {
    if (!file) return
    setStep('processing')
    setProgress(20)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('apiKey', apiKey)
      formData.append('idPrefix', idPrefix)

      setProgress(40)
      const res = await fetch('/api/ai/extract-aas', { method: 'POST', body: formData })
      setProgress(90)

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')

      setResult(data.result)
      setProgress(100)
      setStep('review')
    } catch (err: any) {
      setError(err.message)
      setStep('upload')
    }
  }

  const handleImport = () => {
    if (!result) return
    const submodels = extractionResultToSubmodels(result)
    onImport(submodels, { idShort: result.assetIdShort, id: result.assetId, description: result.assetDescription })
    toast.success(`Imported ${submodels.length} submodel(s) from PDF`)
    onOpenChange(false)
    reset()
  }

  const totalElements = result?.submodels.reduce((n, sm) => n + sm.elements.length, 0) || 0
  const highCount = result?.submodels.reduce((n, sm) => n + sm.elements.filter(e => e.tier === 'high').length, 0) || 0
  const lowCount = result?.submodels.reduce((n, sm) => n + sm.elements.filter(e => e.tier === 'low').length, 0) || 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            PDF → AAS Extraction
          </DialogTitle>
          <DialogDescription>
            Upload a product specification PDF and AI will extract an AAS model for review.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded border border-red-200 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">PDF File</Label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`mt-1.5 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  file ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-border hover:border-blue-400 hover:bg-muted'
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select a PDF file</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 20MB, text-based PDFs only</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Claude API Key <span className="text-muted-foreground font-normal">(optional if set in .env.local)</span></Label>
              <Input type="password" placeholder="sk-ant-... (leave blank to use server key)" value={apiKey} onChange={e => setApiKey(e.target.value)} className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-1">Used only for this request. Not stored.</p>
            </div>
            <div>
              <Label className="text-sm font-medium">ID Prefix</Label>
              <Input placeholder="urn:extracted" value={idPrefix} onChange={e => setIdPrefix(e.target.value)} className="mt-1.5 font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleExtract} disabled={!file} className="bg-blue-600 text-white hover:bg-blue-700">
                <Sparkles className="h-4 w-4 mr-2" />Extract with AI
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-8 space-y-4 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-blue-500" />
            <p className="font-medium">Extracting AAS model from PDF...</p>
            <p className="text-sm text-muted-foreground">This may take up to 30 seconds</p>
            <Progress value={progress} className="max-w-xs mx-auto" />
          </div>
        )}

        {step === 'review' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg border">
                <p className="text-2xl font-bold">{totalElements}</p>
                <p className="text-xs text-muted-foreground">Properties</p>
              </div>
              <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950">
                <p className="text-2xl font-bold text-green-600">{highCount}</p>
                <p className="text-xs text-muted-foreground">High confidence</p>
              </div>
              <div className={`p-3 rounded-lg border ${lowCount > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950' : 'border-border'}`}>
                <p className={`text-2xl font-bold ${lowCount > 0 ? 'text-red-600' : ''}`}>{lowCount}</p>
                <p className="text-xs text-muted-foreground">Need review</p>
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 mt-0.5" />
                <div>{result.warnings.map((w, i) => <p key={i} className="text-yellow-800 dark:text-yellow-200">{w}</p>)}</div>
              </div>
            )}
            <ScrollArea className="h-72 border rounded-lg p-3">
              {result.submodels.map(sm => (
                <div key={sm.idShort} className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" />{sm.idShort}
                    <Badge variant="outline" className="text-xs">{sm.elements.length} elements</Badge>
                  </h4>
                  <div className="space-y-1.5 pl-4">
                    {sm.elements.map(el => <ElementRow key={el.idShort} el={el} />)}
                  </div>
                </div>
              ))}
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Start Over</Button>
              <Button onClick={handleImport} className="bg-blue-600 text-white hover:bg-blue-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Import {result.submodels.length} Submodel{result.submodels.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
