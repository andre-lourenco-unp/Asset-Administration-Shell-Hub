"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2, X, AlertCircle, Pencil, Check, Sparkles, ArrowRight, Package, Search, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { fetchTemplates, isRateLimited, rateLimitResetSeconds } from "@/lib/github-templates"

interface SubmodelTemplate {
  name: string
  version: string
  description: string
  url: string
}

interface SelectedSubmodel {
  template: SubmodelTemplate
  idShort: string
}

// idShort validation pattern (AAS 3.1 compliant)
const ID_SHORT_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z]$/

// Validate idShort against AAS 3.1 pattern
function isValidIdShort(value: string): boolean {
  if (!value || value.trim() === "") return false
  return ID_SHORT_PATTERN.test(value.trim())
}

// Simple URI validation
function isValidUri(value: string): boolean {
  if (!value || value.trim() === "") return false
  // Check for common URI schemes or URN format
  return /^(https?:\/\/|urn:|file:\/\/)/i.test(value.trim())
}


export function AASCreator({ onProceedToEditor, onClose }: { onProceedToEditor: (config: any) => void, onClose?: () => void }) {
  const [templates, setTemplates] = useState<SubmodelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedSubmodels, setSelectedSubmodels] = useState<SelectedSubmodel[]>([])
  const [aasIdShort, setAasIdShort] = useState("MyAssetAdministrationShell")
  const [aasId, setAasId] = useState("https://example.com/aas/1")
  const [assetKind, setAssetKind] = useState<"Instance" | "Type">("Instance")
  const [globalAssetId, setGlobalAssetId] = useState("https://example.com/asset/1")
  const [searchQuery, setSearchQuery] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [open, setOpen] = useState(true)
  // Track which submodel idShort is being edited
  const [editingSubmodelIndex, setEditingSubmodelIndex] = useState<number | null>(null)
  const [editingIdShortValue, setEditingIdShortValue] = useState("")

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      setApiError(null)

      const { templates: fetched, rateLimited } = await fetchTemplates()

      if (rateLimited && fetched.length === 0) {
        const secs = rateLimitResetSeconds()
        setApiError(
          `GitHub API rate limit reached. Please wait ${secs > 60 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`} and try again.`
        )
        return
      }

      if (rateLimited && fetched.length > 0) {
        toast.info("Using cached templates — GitHub API rate limit reached")
      }

      setTemplates(fetched)
    } catch (error) {
      console.error("Error loading templates:", error)
      setApiError("Could not load templates from GitHub.")
    } finally {
      setLoading(false)
    }
  }

  const addSubmodel = (template: SubmodelTemplate) => {
    // Check if template is already added
    const alreadyAdded = selectedSubmodels.some(sm => sm.template.name === template.name)
    if (alreadyAdded) {
      toast.warning(`"${template.name}" is already added`)
      return
    }

    // Generate a valid idShort from template name
    let idShort = template.name.replace(/\s+/g, "")
    // Ensure it matches AAS 3.1 pattern
    if (!isValidIdShort(idShort)) {
      // Sanitize: remove invalid characters, ensure starts with letter
      idShort = idShort.replace(/[^a-zA-Z0-9_-]/g, "")
      if (!/^[a-zA-Z]/.test(idShort)) {
        idShort = "Sm" + idShort
      }
    }

    setSelectedSubmodels([...selectedSubmodels, { template, idShort }])
  }

  const removeSubmodel = (index: number) => {
    setSelectedSubmodels(selectedSubmodels.filter((_, i) => i !== index))
    // Reset editing state if we removed the one being edited
    if (editingSubmodelIndex === index) {
      setEditingSubmodelIndex(null)
      setEditingIdShortValue("")
    } else if (editingSubmodelIndex !== null && editingSubmodelIndex > index) {
      // Adjust index if we removed one before the editing one
      setEditingSubmodelIndex(editingSubmodelIndex - 1)
    }
  }

  const updateSubmodelIdShort = (index: number, newIdShort: string) => {
    const updated = [...selectedSubmodels]
    updated[index].idShort = newIdShort
    setSelectedSubmodels(updated)
  }

  const startEditingSubmodel = (index: number) => {
    setEditingSubmodelIndex(index)
    setEditingIdShortValue(selectedSubmodels[index].idShort)
  }

  const confirmEditingSubmodel = () => {
    if (editingSubmodelIndex === null) return

    const trimmed = editingIdShortValue.trim()
    if (!isValidIdShort(trimmed)) {
      toast.error("Invalid idShort: must start with a letter and contain only letters, digits, underscore, or hyphen")
      return
    }

    // Check for duplicate idShort
    const duplicate = selectedSubmodels.some((sm, idx) =>
      idx !== editingSubmodelIndex && sm.idShort === trimmed
    )
    if (duplicate) {
      toast.error("This idShort is already used by another submodel")
      return
    }

    updateSubmodelIdShort(editingSubmodelIndex, trimmed)
    setEditingSubmodelIndex(null)
    setEditingIdShortValue("")
  }

  const cancelEditingSubmodel = () => {
    setEditingSubmodelIndex(null)
    setEditingIdShortValue("")
  }

  const generateAAS = () => {
    onProceedToEditor({
      idShort: aasIdShort,
      id: aasId,
      assetKind: assetKind,
      globalAssetId: globalAssetId,
      selectedSubmodels: selectedSubmodels,
    })
  }

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Validation for Step 1 fields
  const aasIdShortValid = isValidIdShort(aasIdShort)
  const aasIdValid = isValidUri(aasId)
  const globalAssetIdValid = isValidUri(globalAssetId)

  const isStep1Valid =
    aasIdShortValid &&
    aasIdValid &&
    assetKind.trim().length > 0 &&
    globalAssetIdValid

  // Check if all submodel idShorts are valid
  const allSubmodelIdShortsValid = selectedSubmodels.every(sm => isValidIdShort(sm.idShort))

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) onClose?.()
      }}
    >
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden border-0 shadow-2xl">
        {/* Beautiful gradient header */}
        <div className="relative bg-gradient-to-br from-[#61caf3] via-[#4db6e6] to-[#3a9fd4] px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
          <DialogHeader className="relative z-10">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                Create Asset Administration Shell
              </DialogTitle>
            </div>
            <DialogDescription className="text-white/80 pl-12">
              Design your digital twin with ease
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mt-5 pl-1">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300",
              step === 1
                ? "bg-white text-[#3a9fd4] shadow-lg"
                : "bg-white/20 text-white/90 backdrop-blur-sm"
            )}>
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                step === 1 ? "bg-[#3a9fd4] text-white" : "bg-white/30"
              )}>1</span>
              AAS Details
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300",
              step === 2
                ? "bg-white text-[#3a9fd4] shadow-lg"
                : "bg-white/20 text-white/90 backdrop-blur-sm"
            )}>
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                step === 2 ? "bg-[#3a9fd4] text-white" : "bg-white/30"
              )}>2</span>
              Submodels
            </div>
          </div>
        </div>

        <div className="px-6 py-5">

        {step === 1 ? (
          <div className="space-y-5">
            {/* Form fields in a beautiful card */}
            <div className="grid gap-4">
              {/* AAS IdShort */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                  AAS IdShort
                  <span className="text-red-400 text-xs">required</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={aasIdShort}
                    onChange={(e) => setAasIdShort(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white transition-all duration-200",
                      "bg-white dark:bg-gray-800/50 border-2",
                      "focus:outline-none focus:ring-4 focus:ring-[#61caf3]/20",
                      "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                      aasIdShort.trim() && !aasIdShortValid
                        ? "border-red-400 focus:border-red-400"
                        : "border-gray-200 dark:border-gray-700 focus:border-[#61caf3]"
                    )}
                    placeholder="MyAssetAdministrationShell"
                  />
                  {aasIdShort.trim() && aasIdShortValid && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                  )}
                </div>
                {aasIdShort.trim() && !aasIdShortValid && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Must start with a letter, contain only letters, digits, "_" or "-"
                  </p>
                )}
              </div>

              {/* AAS ID */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                  AAS ID (URI)
                  <span className="text-red-400 text-xs">required</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={aasId}
                    onChange={(e) => setAasId(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white transition-all duration-200",
                      "bg-white dark:bg-gray-800/50 border-2",
                      "focus:outline-none focus:ring-4 focus:ring-[#61caf3]/20",
                      "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                      aasId.trim() && !aasIdValid
                        ? "border-red-400 focus:border-red-400"
                        : "border-gray-200 dark:border-gray-700 focus:border-[#61caf3]"
                    )}
                    placeholder="https://example.com/aas/1"
                  />
                  {aasId.trim() && aasIdValid && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                  )}
                </div>
                {aasId.trim() && !aasIdValid && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Must be a valid URI (https://, urn:, or file://)
                  </p>
                )}
              </div>

              {/* Asset Kind - beautiful toggle buttons */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                  Asset Kind
                  <span className="text-red-400 text-xs">required</span>
                </label>
                <div className="flex gap-2">
                  {(["Instance", "Type"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setAssetKind(kind)}
                      className={cn(
                        "flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 border-2",
                        assetKind === kind
                          ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white border-transparent shadow-lg shadow-[#61caf3]/25"
                          : "bg-white dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#61caf3]/50"
                      )}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>

              {/* Global Asset ID */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                  Global Asset ID (URI)
                  <span className="text-red-400 text-xs">required</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={globalAssetId}
                    onChange={(e) => setGlobalAssetId(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white transition-all duration-200",
                      "bg-white dark:bg-gray-800/50 border-2",
                      "focus:outline-none focus:ring-4 focus:ring-[#61caf3]/20",
                      "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                      globalAssetId.trim() && !globalAssetIdValid
                        ? "border-red-400 focus:border-red-400"
                        : "border-gray-200 dark:border-gray-700 focus:border-[#61caf3]"
                    )}
                    placeholder="https://example.com/asset/1"
                  />
                  {globalAssetId.trim() && globalAssetIdValid && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                  )}
                </div>
                {globalAssetId.trim() && !globalAssetIdValid && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Must be a valid URI (https://, urn:, or file://)
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* API Error Warning */}
            {apiError && (
              <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-amber-800 dark:text-amber-200 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Header with count badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-[#61caf3]" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Submodel Templates
                </h3>
              </div>
              {selectedSubmodels.length > 0 && (
                <span className="px-3 py-1 bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white text-sm font-medium rounded-full shadow-sm">
                  {selectedSubmodels.length} selected
                </span>
              )}
            </div>

            {/* Selected Submodels - Beautiful card */}
            {selectedSubmodels.length > 0 && (
              <div className="p-4 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200/50 dark:border-emerald-700/50 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                  Selected Submodels
                  <span className="text-xs font-normal text-emerald-600/70 dark:text-emerald-400/70">(click to edit idShort)</span>
                </div>
                <div className="space-y-2">
                  {selectedSubmodels.map((sm, index) => (
                    <div
                      key={sm.template.name}
                      className="flex items-center gap-3 bg-white dark:bg-gray-800/80 rounded-lg px-3 py-2 shadow-sm border border-emerald-100 dark:border-emerald-800/50 transition-all hover:shadow-md"
                    >
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-28 truncate font-medium" title={sm.template.name}>
                        {sm.template.name}
                      </span>
                      <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                      {editingSubmodelIndex === index ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingIdShortValue}
                            onChange={(e) => setEditingIdShortValue(e.target.value)}
                            className={cn(
                              "flex-1 px-2 py-1.5 text-xs border-2 rounded-lg transition-colors",
                              "bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-[#61caf3]/20",
                              !isValidIdShort(editingIdShortValue.trim())
                                ? "border-red-400"
                                : "border-[#61caf3] dark:border-[#61caf3]"
                            )}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEditingSubmodel()
                              if (e.key === "Escape") cancelEditingSubmodel()
                            }}
                          />
                          <button
                            type="button"
                            onClick={confirmEditingSubmodel}
                            className="p-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-800 rounded-lg transition-colors"
                            title="Confirm"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingSubmodel}
                            className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditingSubmodel(index)}
                            className={cn(
                              "flex-1 text-left px-2 py-1.5 text-xs font-mono rounded-lg transition-all",
                              !isValidIdShort(sm.idShort)
                                ? "text-red-600 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800"
                                : "text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                            title="Click to edit idShort"
                          >
                            {sm.idShort}
                            {!isValidIdShort(sm.idShort) && (
                              <span className="ml-2 text-[10px] text-red-500 font-sans">(invalid)</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditingSubmodel(index)}
                            className="p-1.5 text-gray-400 hover:text-[#61caf3] hover:bg-[#61caf3]/10 rounded-lg transition-colors"
                            title="Edit idShort"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${sm.idShort}`}
                        onClick={() => removeSubmodel(index)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search bar - beautiful */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-white focus:outline-none focus:border-[#61caf3] focus:ring-4 focus:ring-[#61caf3]/20 transition-all placeholder:text-gray-400"
              />
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-[#61caf3]/20" />
                  <Loader2 className="w-12 h-12 animate-spin text-[#61caf3] absolute inset-0" />
                </div>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading templates from IDTA...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No templates found matching "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-sm text-[#61caf3] hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid gap-3 max-h-[45vh] overflow-auto pr-1">
                {filteredTemplates.map((template) => {
                  const isAdded = selectedSubmodels.some(sm => sm.template.name === template.name)
                  return (
                    <div
                      key={template.name}
                      className={cn(
                        "group relative rounded-xl p-4 transition-all duration-200 border-2",
                        isAdded
                          ? "border-emerald-300 dark:border-emerald-600 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-900/20 dark:to-teal-900/20"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-[#61caf3] hover:shadow-lg hover:shadow-[#61caf3]/10"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                              {template.name}
                            </h4>
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full shrink-0">
                              v{template.version}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                        {isAdded ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                            Added
                          </div>
                        ) : (
                          <button
                            onClick={() => addSubmodel(template)}
                            className="p-2.5 bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white rounded-xl hover:shadow-lg hover:shadow-[#61caf3]/30 transition-all duration-200 hover:scale-105 shrink-0"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        </div>

        <DialogFooter className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900/80 dark:to-gray-800/50 border-t border-gray-200/50 dark:border-gray-700/50">
          {step === 2 ? (
            <div className="flex w-full flex-col gap-3">
              {/* Warning if no submodels selected */}
              {selectedSubmodels.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/50 dark:border-amber-700/50 rounded-xl text-amber-700 dark:text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No submodels selected. You can add submodels later in the editor.</span>
                </div>
              )}
              {/* Warning if any submodel idShort is invalid */}
              {selectedSubmodels.length > 0 && !allSubmodelIdShortsValid && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200/50 dark:border-red-700/50 rounded-xl text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Some submodel idShorts are invalid. Please fix them before proceeding.</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
                >
                  Back
                </button>
                <button
                  onClick={generateAAS}
                  disabled={selectedSubmodels.length > 0 && !allSubmodelIdShortsValid}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-200",
                    selectedSubmodels.length === 0 || allSubmodelIdShortsValid
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02]"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  )}
                >
                  <Sparkles className="w-5 h-5" />
                  {selectedSubmodels.length === 0 ? "Create Empty AAS" : "Generate & Open Editor"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full items-center justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-200",
                  isStep1Valid
                    ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white shadow-lg shadow-[#61caf3]/25 hover:shadow-[#61caf3]/40 hover:scale-[1.02]"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                )}
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}