"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, ChevronDown, FileText, CheckCircle, AlertCircle, Download, X, Copy } from 'lucide-react'
import JSZip from 'jszip'
import type { ValidationResult, ValidationError } from "@/lib/types" // Import ValidationResult type
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible" // Import Collapsible components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import KeysEditor from "@/components/keys-editor"
import { validateAASStructure } from "@/lib/json-validator"
import { parseCapabilitySubmodel } from "@/lib/parsers/capability-parser"
import { CAPABILITY_SEMANTIC_IDS, type ParsedCapabilitySubmodel } from "@/lib/types/capability"
import { CapabilityCard } from "@/components/submodels/capability/CapabilityCard"
import {
  IEC_DATA_TYPES,
  XSD_VALUE_TYPES,
  XSD_CANON_MAP,
  normalizeValueType,
  deriveValueTypeFromIEC,
  isValidValueForXsdType,
} from "@/lib/constants"

const CATEGORY_OPTIONS = ["CONSTANT", "PARAMETER", "VARIABLE"];

// ADD: cardinality badge like editor
const getCardinalityBadge = (cardinality: string) => {
  const colorMap: Record<string, string> = {
    "One": "bg-red-600",
    "ZeroToOne": "bg-yellow-600",
    "ZeroToMany": "bg-blue-600",
    "OneToMany": "bg-purple-600"
  };
  return (
    <span className={`px-2 py-0.5 ${colorMap[cardinality] || "bg-gray-500"} text-white text-xs font-semibold rounded`}>
      {cardinality}
    </span>
  );
};

interface AASXVisualizerProps {
  uploadedFiles: ValidationResult[] // Use ValidationResult type
  newFileIndex?: number | null
  onFileSelected?: () => void
}

export function AASXVisualizer({ uploadedFiles, newFileIndex, onFileSelected }: AASXVisualizerProps) {
  const [aasxData, setAasxData] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<ValidationResult | null>(null) // Use ValidationResult type
  const [selectedShellIndex, setSelectedShellIndex] = useState<number | null>(0)
  const [selectedSubmodel, setSelectedSubmodel] = useState<any>(null)
  const [selectedElement, setSelectedElement] = useState<any>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [hideEmptyElements, setHideEmptyElements] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // Edit mode for AAS card (left panel)
  const [aasEditMode, setAasEditMode] = useState(false)
  // ADD: internal validation state
  const [internalIssues, setInternalIssues] = useState<string[]>([])
  const [validationErrorPaths, setValidationErrorPaths] = useState<Set<string>>(new Set())
  // NEW: live schema errors (updated every Validate click)
  const [liveErrors, setLiveErrors] = useState<(string | { message: string })[]>([])
  // Capability submodel parsed data (computed when a capability submodel is selected)
  const [capabilityData, setCapabilityData] = useState<ParsedCapabilitySubmodel | null>(null)
  const capabilityCacheRef = useRef<{ xml: string; smId: string; data: ParsedCapabilitySubmodel } | null>(null)

  // Detect and parse capability submodels from the original XML
  const resolveSemanticId = (semId: any): string | undefined => {
    if (!semId) return undefined
    if (typeof semId === 'string') return semId
    // Object with keys array (parsed XML): { keys: [{ value }] } or { keys: { key: { value } } }
    if (semId.keys) {
      if (Array.isArray(semId.keys)) {
        return semId.keys[0]?.value
      }
      // fast-xml-parser style: keys.key may be object or array
      const k = semId.keys.key
      if (Array.isArray(k)) return k[0]?.value
      if (k?.value) return k.value
    }
    if (semId.value) return String(semId.value)
    return undefined
  }
  const isCapabilitySubmodelSelected = resolveSemanticId(selectedSubmodel?.semanticId) === CAPABILITY_SEMANTIC_IDS.Submodel

  useEffect(() => {
    if (!isCapabilitySubmodelSelected || !selectedFile?.originalXml || !selectedSubmodel?.id) {
      setCapabilityData(null)
      return
    }
    // Return cached result if XML and submodel ID haven't changed
    const cached = capabilityCacheRef.current
    if (cached && cached.xml === selectedFile.originalXml && cached.smId === selectedSubmodel.id) {
      setCapabilityData(cached.data)
      return
    }
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(selectedFile.originalXml, 'text/xml')
      const submodels = doc.querySelectorAll('submodel')
      for (let i = 0; i < submodels.length; i++) {
        const sm = submodels[i]
        const idEl = sm.querySelector('id')
        if (idEl?.textContent?.trim() === selectedSubmodel.id) {
          const parsed = parseCapabilitySubmodel(sm)
          capabilityCacheRef.current = { xml: selectedFile.originalXml, smId: selectedSubmodel.id, data: parsed }
          setCapabilityData(parsed)
          return
        }
      }
      setCapabilityData(null)
    } catch {
      setCapabilityData(null)
    }
  }, [isCapabilitySubmodelSelected, selectedFile?.originalXml, selectedSubmodel?.id])

  // Copy helper for AAS fields
  const copyText = (label: string, value?: string) => {
    const text = String(value ?? '').trim()
    if (!text) {
      toast.error(`No ${label} to copy`)
      return
    }
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  // Update helper for AAS fields (writes into selected shell)
  const setAASFieldValue = (key: 'idShort' | 'id' | 'assetKind' | 'globalAssetId', value: string) => {
    const idx = selectedShellIndex ?? 0
    if (!aasxData || !Array.isArray(aasxData.assetAdministrationShells) || !aasxData.assetAdministrationShells[idx]) return
    const shell = aasxData.assetAdministrationShells[idx]
    if (key === 'globalAssetId') {
      shell.assetInformation = shell.assetInformation || {}
      shell.assetInformation.globalAssetId = value
    } else {
      ;(shell as any)[key] = value
    }
    setAasxData({ ...aasxData })
  }

  useEffect(() => {
    if (newFileIndex != null && newFileIndex >= 0 && uploadedFiles[newFileIndex]) {
      setSelectedFile(uploadedFiles[newFileIndex])
      onFileSelected?.()
    } else if (uploadedFiles.length > 0 && !selectedFile) {
      setSelectedFile(uploadedFiles[0])
    }
  }, [uploadedFiles, selectedFile, newFileIndex, onFileSelected])

  useEffect(() => {
    if (!selectedFile) return

    // Ensure content is parsed AASXData structure
    if (selectedFile.aasData && selectedFile.aasData.submodels) { // Use aasData from ValidationResult
      setAasxData(selectedFile.aasData)
      setSelectedShellIndex(0)
      // Select first submodel that belongs to the first shell (or first overall)
      const shells = selectedFile.aasData.assetAdministrationShells
      const firstShell = shells?.[0]
      const refs = firstShell?.submodelRefs
      const allSubmodels = selectedFile.aasData.submodels
      if (refs && refs.length > 0) {
        const first = allSubmodels.find((sm: any) => refs.includes(sm.id))
        setSelectedSubmodel(first || allSubmodels[0])
      } else {
        setSelectedSubmodel(allSubmodels[0])
      }
    } else {
      // Fallback if content is not in expected AASXData format
      setAasxData({ idShort: selectedFile.file, submodels: [] }) // Use file.name for idShort
      setSelectedSubmodel(null)
    }
  }, [selectedFile])

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  // Validate current submodel (like editor)
  const validateAAS = (): { valid: boolean; missingFields: string[]; nodesToExpand: Set<string>; errorPaths: Set<string> } => {
    const missingFields: string[] = []
    const nodesToExpand = new Set<string>()
    const errorPaths = new Set<string>()

    // UPDATED: align with XSD so underscore is allowed at the end
    const idShortPattern = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9_]+$|^[a-zA-Z]$/

    const validateElements = (els: any[], submodelId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const type = getElementType(el)
        const currentChain = [...chain, el.idShort || 'Element']
        const fullKey = `${submodelId}>${currentChain.join('>')}`
        const cardQual = el.qualifiers?.find((q: any) => q.type === "Cardinality")
        const cardinality = cardQual?.value || el.cardinality || "ZeroToOne"
        const isRequired = cardinality === "One" || cardinality === "OneToMany"

        // idShort pattern compliance (surface as an issue and highlight the node)
        const idShort = el.idShort
        if (typeof idShort === 'string' && idShort.trim() !== '' && !idShortPattern.test(idShort)) {
          missingFields.push(`${submodelId} > ${currentChain.join(' > ')} (idShort "${idShort}" doesn't match pattern [a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9])`)
          errorPaths.add(fullKey)
          for (let i = 0; i < currentChain.length - 1; i++) nodesToExpand.add(currentChain.slice(0, i + 1).join('.'))
        }

        // Property checks: valueType or IEC dataType required; and if set, value must match
        if (type === "Property") {
          const vtNorm = normalizeValueType(el.valueType) || deriveValueTypeFromIEC(el.dataType)
          if (!vtNorm && isRequired) {
            missingFields.push(`${submodelId} > ${currentChain.join(' > ')} (set Value Type or IEC Data Type)`)
            errorPaths.add(fullKey)
            // expand parents
            for (let i = 0; i < currentChain.length - 1; i++) nodesToExpand.add(currentChain.slice(0, i + 1).join('.'))
          }
          if (vtNorm && typeof el.value === 'string' && el.value.trim() !== '' && !isValidValueForXsdType(vtNorm, el.value)) {
            missingFields.push(`${submodelId} > ${currentChain.join(' > ')} (value "${el.value}" doesn't match ${vtNorm})`)
            errorPaths.add(fullKey)
            for (let i = 0; i < currentChain.length - 1; i++) nodesToExpand.add(currentChain.slice(0, i + 1).join('.'))
          }
        }

        // Required value presence
        let hasValue = false
        if (type === "Property") {
          hasValue = typeof el.value === 'string' && el.value.trim() !== ''
        } else if (type === "MultiLanguageProperty") {
          if (Array.isArray(el.value)) {
            hasValue = el.value.some((v: any) => v && v.text && String(v.text).trim() !== '')
          } else if (el.value && typeof el.value === 'object') {
            hasValue = Object.values(el.value).some((t: any) => t && String(t).trim() !== '')
          }
        } else if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
          const children = Array.isArray(el.value) ? el.value : []
          hasValue = children.length > 0
        } else if (type === "File") {
          hasValue = typeof el.value === 'string' && el.value.trim() !== ''
        }

        if (isRequired && !hasValue) {
          missingFields.push(`${submodelId} > ${currentChain.join(' > ')}`)
          errorPaths.add(fullKey)
          for (let i = 0; i < currentChain.length - 1; i++) nodesToExpand.add(currentChain.slice(0, i + 1).join('.'))
        }

        // Recurse into children for collections/lists
        if ((type === "SubmodelElementCollection" || type === "SubmodelElementList") && Array.isArray(el.value)) {
          validateElements(el.value, submodelId, currentChain)
        }
      })
    }

    // Validate all submodels, like the Editor does
    const submodels: any[] = Array.isArray(aasxData?.submodels) ? aasxData.submodels : []
    if (submodels.length === 0) {
      return { valid: true, missingFields, nodesToExpand, errorPaths }
    }
    submodels.forEach((sm: any) => {
      const elements: any[] = sm?.submodelElements || []
      const submodelId = sm?.idShort || 'Submodel'
      validateElements(elements, submodelId, [])
    })
    return { valid: missingFields.length === 0, missingFields, nodesToExpand, errorPaths }
  }

  const runInternalValidation = () => {
    const res = validateAAS()
    setInternalIssues(res.missingFields)
    setValidationErrorPaths(res.errorPaths)
    // Expand nodes along idShort chain (stable keys)
    setExpandedNodes((prev) => new Set([...prev, ...res.nodesToExpand]))
    if (res.valid) {
      toast.success("No missing required fields.")
    } else {
      toast.error(`Please fill all required fields (${res.missingFields.length} missing).`)
    }
    // NEW: Live structural validation against current in-memory data
    const structureValidation = validateAASStructure(aasxData || {})
    const nextErrors = structureValidation.valid
      ? []
      : (structureValidation.errors || []).map((e: any) => (typeof e === 'string' ? e : e?.message || ''))
    setLiveErrors(nextErrors)
  }

  // Navigate to a missing field path like "SubmodelId > A > B > C"
  const goToIssuePath = (issue: string) => {
    const parts = issue.split('>').map((p) => p.trim()).filter(Boolean)
    if (parts.length < 2) return
    const submodelId = parts[0]
    const pathSegments = parts.slice(1)
    const sm = (aasxData?.submodels || []).find((s: any) => s.idShort === submodelId)
    if (!sm) return
    setSelectedSubmodel(sm)
    // Expand using stable chain keys "A", "A.B", ...
    const newExpanded = new Set(expandedNodes)
    const cumulative: string[] = []
    pathSegments.forEach((seg) => {
      cumulative.push(seg)
      newExpanded.add(cumulative.join('.'))
    })
    setExpandedNodes(newExpanded)
    // Find element by chain and select it
    const findByChain = (els: any[], chain: string[], idx = 0): any | null => {
      if (idx >= chain.length) return null
      const cur = els.find((e: any) => e.idShort === chain[idx])
      if (!cur) return null
      if (idx === chain.length - 1) return cur
      const children = Array.isArray(cur.value) ? cur.value : []
      return findByChain(children, chain, idx + 1)
    }
    const target = findByChain(sm.submodelElements || [], pathSegments)
    if (target) setSelectedElement(target)
  }

  // Find the first tree path for an element by idShort across all submodels
  const findFirstPathForIdShort = (needle: string): string | null => {
    if (!aasxData?.submodels) return null
    for (const sm of aasxData.submodels) {
      const submodelId = sm?.idShort || 'Submodel'
      const walk = (els: any[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const cur = [...chain, el?.idShort || 'Element']
          if (el?.idShort === needle) return `${submodelId} > ${cur.join(' > ')}`
          if (Array.isArray(el?.value)) {
            const found = walk(el.value, cur)
            if (found) return found
          }
        }
        return null
      }
      const res = walk(sm?.submodelElements || [], [])
      if (res) return res
    }
    return null
  }

  // Build user-friendly schema errors with optional Go to support
  type FriendlyError = { message: string; hint?: string; path?: string }
  const buildFriendlyErrors = (source?: (string | ValidationError)[]): FriendlyError[] => {
    const raw: string[] = (source || []).map((e: any) => (typeof e === 'string' ? e : e?.message || ''))

    // Aggregate duplicates to reduce noise
    const bucket = new Map<string, { message: string; hint?: string; count: number; path?: string }>()
    const add = (message: string, hint?: string, path?: string) => {
      const key = `${message}::${hint ?? ""}`
      const entry = bucket.get(key)
      if (entry) {
        entry.count += 1
      } else {
        bucket.set(key, { message, hint, count: 1, path })
      }
    }

    for (const msg of raw) {
      // idShort pattern issues: pull the offending value and provide simple rule
      const idShortValueMatch = msg.match(/idShort.*value '([^']+)'/i)
      if (idShortValueMatch) {
        const bad = idShortValueMatch[1]
        const path = findFirstPathForIdShort(bad) || undefined
        add(
          `Name "${bad}" doesn't follow naming rules`,
          'Start with a letter; use letters, digits, "_" or "-".',
          path
        )
        continue
      }

      // Missing valueType for Property
      if (/property.*Missing child element.*valueType/i.test(msg)) {
        add(
          'A Property is missing its Value Type',
          'In the Value section, choose a type (e.g., xs:string, xs:integer).'
        )
        continue
      }

      // Description not allowed in Reference-like nodes (schema expects value/valueId)
      if (/description.*not expected.*Expected.*(value|valueId)/i.test(msg)) {
        add(
          'Description is not allowed for this item',
          'Remove the Description field from this element.'
        )
        continue
      }

      // Qualifiers not allowed in nodes that expect only value/valueId
      if (/qualifiers.*not expected.*Expected.*(value|valueId)/i.test(msg)) {
        add(
          'Extra qualifiers aren’t allowed here',
          'Remove "Cardinality" or other qualifiers from this element.'
        )
        continue
      }

      // semanticId not expected; schema expects value/valueId (typical for ReferenceElement)
      if (/semanticId.*not expected.*Expected.*valueId/i.test(msg)) {
        add(
          'This item expects a reference value, not a Semantic ID',
          'Open the element and fill "Reference Keys" under Value, then remove Semantic ID.'
        )
        continue
      }

      // semanticId not expected; schema expects value/valueId (general form)
      if (/semanticId.*not expected.*Expected.*(value|valueId)/i.test(msg)) {
        add(
          'Use a direct value or a reference instead of Semantic ID here',
          'Fill the Value or the Reference Keys and remove Semantic ID from this item.'
        )
        continue
      }

      // Minimal length (empty required field)
      if (/value.*minLength/i.test(msg)) {
        add(
          'A required field is empty',
          'Enter at least 1 character; required fields cannot be empty.'
        )
        continue
      }

      // Display name missing (IEC61360)
      if (/displayName.*Missing child element/i.test(msg)) {
        add(
          'Display name is missing a language entry',
          'Add a name (e.g., language "en") to displayName.'
        )
        continue
      }

      // Preferred name missing (IEC61360)
      if (/preferredName.*Missing child element/i.test(msg)) {
        add(
          'Preferred name is missing',
          'Add Preferred Name (e.g., English "en") for the IEC 61360 data spec.'
        )
        continue
      }

      // Reference keys missing
      if (/keys.*Missing child element/i.test(msg)) {
        add(
          'A Reference lacks required key entries',
          'Add at least one "key" with proper type and value.'
        )
        continue
      }

      // AssetInformation › specificAssetIds empty
      if (/specificAssetIds.*Missing child element/i.test(msg)) {
        add(
          'Asset Information › specificAssetIds is empty',
          'Add one or more specificAssetId entries in Asset Information.'
        )
        continue
      }

      // ConceptDescriptions list empty
      if (/conceptDescriptions.*Missing child element/i.test(msg)) {
        add(
          'Concept Descriptions list is empty',
          'Add at least one conceptDescription entry for referenced semantics.'
        )
        continue
      }

      // Fallback: keep a short version of the message
      add(msg.replace(/\s+/g, ' ').trim())
    }

    // Flatten aggregated messages and add repeat indicator
    const out: FriendlyError[] = []
    bucket.forEach(({ message, hint, count, path }) => {
      const m = count > 1 ? `${message} — repeats ${count} times` : message
      out.push({ message: m, hint, path })
    })
    return out
  }

  const getElementType = (element: any): string => {
    if (!element?.modelType) return "Property"
    return element.modelType
  }

  // helper to update currently selected element within aasxData
  const updateSelectedElement = (updater: (el: any) => void) => {
    if (!selectedElement || !aasxData) return
    let updated = false
    const updateInElements = (elements: any[]): boolean => {
      if (!Array.isArray(elements)) return false
      for (const el of elements) {
        if (el === selectedElement) {
          updater(el)
          return true
        }
        if (Array.isArray(el?.value) && updateInElements(el.value)) {
          return true
        }
      }
      return false
    }
    for (const sm of aasxData?.submodels || []) {
      if (updateInElements(sm?.submodelElements || [])) {
        updated = true
        break
      }
    }
    if (updated) {
      setAasxData({ ...aasxData })
      // keep same object reference for selectedElement; shallow update is enough to re-render
    }
  }

  // shorthand setter
  const setField = (key: string, value: any) => {
    updateSelectedElement((el) => {
      ;(el as any)[key] = value
    })
  }

  // New: download handler for a specific element (used in middle panel)
  const handleDownloadElement = (el: any) => {
    if (!el) return
    const type = getElementType(el)
    if (type !== "File") return

    const raw = String(el.value ?? "").trim()
    if (!raw) {
      toast.error("No file target found on this element")
      return
    }

    // 1) Direct data URL
    if (/^data:/i.test(raw)) {
      const filename = "download"
      const a = document.createElement("a")
      a.href = raw
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success(`Downloading ${filename}`)
      return
    }

    // 2) External URL
    if (/^https?:\/\//i.test(raw)) {
      window.open(raw, "_blank", "noopener,noreferrer")
      toast.info("Opening file in a new tab")
      return
    }

    // 3) Maybe base64 (including URL-safe base64) that encodes a path/URL
    const tryDecodeBase64 = (s: string): string | null => {
      const normalized = s.replace(/-/g, "+").replace(/_/g, "/")
      try {
        const pad = normalized.length % 4
        const padded = pad ? normalized + "=".repeat(4 - pad) : normalized
        return atob(padded)
      } catch {
        return null
      }
    }
    let candidate = raw
    const decoded = tryDecodeBase64(raw)
    if (decoded) candidate = decoded.trim()
    if (/^https?:\/\//i.test(candidate)) {
      window.open(candidate, "_blank", "noopener,noreferrer")
      toast.info("Opening file in a new tab")
      return
    }

    const normalizePath = (p: string) =>
      p.replace(/^file:\/\//i, "").replace(/^file:\//i, "").replace(/^\/+/, "")
    let pathCandidate = normalizePath(candidate)

    const fileDashIdx = pathCandidate.lastIndexOf("File-")
    let basename = pathCandidate.split("/").pop() || pathCandidate
    if (fileDashIdx >= 0) {
      const tail = pathCandidate.slice(fileDashIdx + "File-".length)
      if (/\.[a-z0-9]{2,5}$/i.test(tail)) {
        basename = tail
      }
    }

    const attachments = (selectedFile as any)?.attachments as Record<string, string> | undefined
    if (!attachments) {
      toast.error("No embedded attachments found in this AASX")
      return
    }

    const candidates = [
      pathCandidate,
      `/${pathCandidate}`,
      basename,
      `/${basename}`,
      `aasx/${basename}`,
      `/aasx/${basename}`,
    ]
    let dataUrl: string | undefined
    for (const k of candidates) {
      if (attachments[k]) {
        dataUrl = attachments[k]
        break
      }
      const found = Object.entries(attachments).find(
        ([key]) =>
          key.toLowerCase().endsWith(`/${basename.toLowerCase()}`) ||
          key.toLowerCase() === basename.toLowerCase(),
      )
      if (found) {
        dataUrl = found[1]
        break
      }
    }
    if (!dataUrl) {
      toast.error(`File not found in AASX attachments: ${basename}`)
      return
    }
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = basename || "download"
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success(`Downloading ${basename}`)
  }

  const getTypeBadge = (type: string, inverted = false) => {
    const badgeMap: Record<string, { label: string; classes: string }> = {
      SubmodelElementCollection: {
        label: "SMC",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-smc" : "aasx-badge aasx-badge-smc",
      },
      Property: {
        label: "Prop",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-prop" : "aasx-badge aasx-badge-prop",
      },
      MultiLanguageProperty: {
        label: "MLP",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-mlp" : "aasx-badge aasx-badge-mlp",
      },
      File: {
        label: "File",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-file" : "aasx-badge aasx-badge-file",
      },
      Operation: {
        label: "Op",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-op" : "aasx-badge aasx-badge-op",
      },
      SubmodelElementList: {
        label: "SML",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-smc" : "aasx-badge aasx-badge-smc",
      },
      BasicEventElement: {
        label: "Evt",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-evt" : "aasx-badge aasx-badge-evt",
      },
      Blob: {
        label: "Blob",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-blob" : "aasx-badge aasx-badge-blob",
      },
      Range: {
        label: "Range",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-range" : "aasx-badge aasx-badge-range",
      },
      ReferenceElement: {
        label: "Ref",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-ref" : "aasx-badge aasx-badge-ref",
      },
      Entity: {
        label: "Entity",
        classes: inverted
          ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-entity"
          : "aasx-badge aasx-badge-entity",
      },
      Capability: {
        label: "Cap",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-cap" : "aasx-badge aasx-badge-cap",
      },
      RelationshipElement: {
        label: "Rel",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-rel" : "aasx-badge aasx-badge-rel",
      },
      AnnotatedRelationshipElement: {
        label: "AnnRel",
        classes: inverted
          ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-annrel"
          : "aasx-badge aasx-badge-annrel",
      },
    }
    const badge = badgeMap[type] || {
      label: "Node",
      classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-node" : "aasx-badge aasx-badge-node",
    }
    return <span className={badge.classes}>{badge.label}</span>
  }

  const hasChildren = (element: any): boolean => {
    // MultiLanguageProperty values are objects with language keys, but shouldn't show as children
    if (element?.modelType === 'MultiLanguageProperty') {
      return false
    }
    // Check for the 'value' property for collections/lists in the parsed structure
    return Array.isArray(element?.value) && element.value.length > 0
  }

  const hasValue = (element: any): boolean => {
    if (!element) return false
    
    const type = getElementType(element)
    
    // Collections and Lists are considered to have value if they have children
    if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
      return hasChildren(element)
    }
    
    // MultiLanguageProperty
    if (type === "MultiLanguageProperty") {
      if (Array.isArray(element.value) && element.value.length > 0) {
        return element.value.some((item: any) => item && item.text)
      }
      // This branch might be deprecated if parser always returns array, but keep for robustness
      if (typeof element.value === "object" && element.value !== null) {
        return Object.keys(element.value).length > 0
      }
    }
    
    // Other types: check if value exists and is not empty
    return element.value !== undefined && element.value !== null && element.value !== ""
  }

  const hasVisibleChildren = (element: any): boolean => {
    if (!hasChildren(element)) return false
    
    const children = element.value || [] // Use element.value for children
    return children.some((child: any) => shouldShowElement(child))
  }

  const shouldShowElement = (element: any): boolean => {
    if (!element || typeof element !== "object") return false
    if (!hideEmptyElements) return true

    const type = getElementType(element)
    
    // For collections and lists, check if they have visible children after filtering
    if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
      return hasVisibleChildren(element)
    }
    
    // For other elements, check if they have a value
    return hasValue(element)
  }

  const renderTreeNode = (element: any, depth = 0, path = "", idChain: string[] = []): React.ReactNode => {
    if (!element || typeof element !== "object") return null
    
    if (!shouldShowElement(element)) {
      return null
    }

    const chain = [...idChain, element.idShort || "node"]
    const nodeId = chain.join('.') // stable idShort chain key
    const isExpanded = expandedNodes.has(nodeId)
    const isSelected = selectedElement === element
    const type = getElementType(element)
    const children = hasChildren(element) ? element.value : [] // Use element.value for children
    const hasKids = children.length > 0
    const hasValidationError = selectedSubmodel
      ? validationErrorPaths.has(`${selectedSubmodel.idShort}>${chain.join('>')}`)
      : false

    const getNodeHeaderClass = () => {
      if (isSelected) {
        if (depth === 0 && hasKids && isExpanded) {
          return "aasx-tree-node-header aasx-tree-node-header-selected-root-expanded"
        }
        if (depth > 0 && hasKids && isExpanded) {
          return "aasx-tree-node-header aasx-tree-node-header-selected-child-expanded"
        }
        return "aasx-tree-node-header aasx-tree-node-header-selected"
      }
      if (hasKids && isExpanded) {
        return "aasx-tree-node-header aasx-tree-node-header-expanded-top"
      }
      return "aasx-tree-node-header aasx-tree-node-header-default"
    }

    const getDisplayValueForTreeNode = () => {
      const type = getElementType(element);
      if (type === "Property" || type === "File") {
        return element.value ? String(element.value) : null;
      }
      if (type === "MultiLanguageProperty") {
        if (Array.isArray(element.value)) {
          const enText = element.value.find((item: any) => item && item.language === 'en')?.text;
          const firstText = element.value[0]?.text;
          return enText || firstText || null;
        }
      }
      return null;
    };

    const displayValue = getDisplayValueForTreeNode()
    const indentStyle = { paddingLeft: hasKids ? `${depth * 20}px` : "0px" }

    return (
      <div key={nodeId} style={{ marginLeft: depth > 0 ? "0px" : "0" }}>
        <div
          className={`${getNodeHeaderClass()} ${hasValidationError ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
          style={indentStyle}
          onClick={() => {
            setSelectedElement(element)
            if (hasKids) toggleNode(nodeId)
          }}
        >
          <div className="aasx-tree-node-expand-icon">
            {hasKids && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNode(nodeId)
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-green-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-green-600" />
                )}
              </span>
            )}
          </div>
          <div className="aasx-tree-node-content">
            {getTypeBadge(type)}
            <div className="aasx-tree-node-info">
              <div className="aasx-tree-node-label-container">
                <span className={`aasx-tree-node-label ${element.idShort ? "aasx-tree-node-label-bold" : ""} ${hasValidationError ? "text-red-700 dark:text-red-400" : ""}`}>
                  {element.idShort || "Element"}
                </span>
                {displayValue && (
                  <span className="aasx-tree-node-value">
                    = {String(displayValue).substring(0, 50)}
                    {String(displayValue).length > 50 ? "..." : ""}
                  </span>
                )}
                {type === "File" && element?.value ? (
                  <button
                    className="ml-2 p-1 rounded hover:bg-green-50 text-green-600 hover:text-green-700"
                    title="Download file"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownloadElement(element)
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
              {hasKids && (
                <span className="aasx-tree-node-element-count">
                  {children.length} element{children.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        {isExpanded && hasKids && (
          <div className="aasx-tree-children-wrapper" style={indentStyle}>
            {children.map((child: any) => renderTreeNode(child, depth + 1, nodeId, chain))}
          </div>
        )}
      </div>
    )
  }

  const renderDetails = () => {
    if (!selectedFile) {
      return <div className="aasx-no-selection-message">Upload a file to view details</div>
    }

    if (!selectedElement) {
      return <div className="aasx-no-selection-message">Select an element to view details</div>
    }

    const type = getElementType(selectedElement)
    const isCollection = type === "SubmodelElementCollection" || type === "SubmodelElementList"

    // Cross-reference navigation: try to find the target element by its value (idShort)
    const handleKeyNavigate = (value: string) => {
      if (!value) return
      // Extract the last segment (e.g. "LaserPower" from a path like "SubmodelId/LaserPower")
      const segments = value.split('/').filter(Boolean)
      const needle = segments[segments.length - 1]
      const path = findFirstPathForIdShort(needle)
      if (path) {
        goToIssuePath(path)
      } else {
        // Try the full value as-is
        const pathFull = findFirstPathForIdShort(value)
        if (pathFull) goToIssuePath(pathFull)
      }
    }

    // Type color mapping for header backgrounds
    const typeColorMap: Record<string, string> = {
      SubmodelElementCollection: "#61caf3",
      Property: "#6662b4",
      MultiLanguageProperty: "#ffa500",
      File: "#10b981",
      SubmodelElementList: "#22c55e",
      BasicEventElement: "#9e005d",
      Blob: "#8b5cf6",
      Operation: "#f59e0b",
      Range: "#ec4899",
      ReferenceElement: "#14b8a6",
      Entity: "#f97316",
      Capability: "#a855f7",
      RelationshipElement: "#06b6d4",
      AnnotatedRelationshipElement: "#0891b2",
    }
    const typeColor = typeColorMap[type] || "#1793b8"

    // Badge color classes for different element types
    const getBadgeColorClass = (t: string): string => {
      const colorClasses: Record<string, string> = {
        SubmodelElementCollection: "bg-[#61caf3] text-white",
        SubmodelElementList: "bg-emerald-500 text-white",
        Property: "bg-[#6662b4] text-white",
        MultiLanguageProperty: "bg-orange-500 text-white",
        File: "bg-emerald-500 text-white",
        BasicEventElement: "bg-pink-700 text-white",
        Blob: "bg-violet-500 text-white",
        Operation: "bg-amber-500 text-white",
        Range: "bg-pink-500 text-white",
        ReferenceElement: "bg-teal-500 text-white",
        Entity: "bg-orange-500 text-white",
        Capability: "bg-purple-500 text-white",
        RelationshipElement: "bg-cyan-500 text-white",
        AnnotatedRelationshipElement: "bg-cyan-600 text-white",
      }
      return colorClasses[t] || "bg-gray-500 text-white"
    }

    // Badge labels
    const getBadgeLabel = (t: string): string => {
      const labels: Record<string, string> = {
        SubmodelElementCollection: "SMC",
        SubmodelElementList: "SML",
        Property: "Prop",
        MultiLanguageProperty: "MLP",
        File: "File",
        BasicEventElement: "Event",
        Blob: "Blob",
        Operation: "Op",
        Range: "Range",
        ReferenceElement: "Ref",
        Entity: "Entity",
        Capability: "Cap",
        RelationshipElement: "Rel",
        AnnotatedRelationshipElement: "AnnRel",
      }
      return labels[t] || "Node"
    }

    const hexToRgba = (hex: string, opacity: number) => {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${opacity})`
    }

    const getSemanticIdValue = (): string => {
      if (!selectedElement.semanticId) {
        return "N/A"
      }
      
      // Handle string semanticId
      if (typeof selectedElement.semanticId === 'string') {
        return selectedElement.semanticId
      }
      
      // Handle object with keys array
      if (selectedElement.semanticId.keys && Array.isArray(selectedElement.semanticId.keys)) {
        const key = selectedElement.semanticId.keys[0]
        if (key && key.value) {
          return String(key.value)
        }
      }
      
      // Handle object with direct value property
      if (selectedElement.semanticId.value) {
        return String(selectedElement.semanticId.value)
      }
      
      return "N/A"
    }

    const getDetailValue = () => {
      if (type === "MultiLanguageProperty") {
        if (Array.isArray(selectedElement.value)) {
          // Return the array to display individual language entries
          return selectedElement.value
        }
        return []
      }
      
      if (isCollection) { // Check if it's a collection or list
        return `Collection (${selectedElement.value?.length || 0} items)`
      }
      
      if (type === "BasicEventElement") {
        return "Event Element"
      }
      return selectedElement.value || "N/A"
    }

    const getDescriptionText = (): string => {
      if (!selectedElement.description) {
        return "N/A"
      }
      
      if (typeof selectedElement.description === "string") {
        return selectedElement.description
      }
      
      if (Array.isArray(selectedElement.description)) {
        const enDesc = selectedElement.description.find((d: any) => d.language === 'en')
        const result = enDesc?.text || selectedElement.description[0]?.text || "N/A"
        return result
      }
      
      if (typeof selectedElement.description === "object") {
        const entries = Object.entries(selectedElement.description)
        if (entries.length > 0) {
          const enValue = (selectedElement.description as any).en
          if (enValue) {
            return String(enValue)
          }
          return String(entries[0][1])
        }
      }
      
      return "N/A"
    }

    const getStringValue = (field: any, preferredLang: string = 'en'): string => {
      if (!field) {
        return ""
      }
      if (typeof field === 'string') {
        return field
      }
      if (typeof field === 'object') {
        if (field[preferredLang]) {
          return String(field[preferredLang])
        }
        const entries = Object.entries(field)
        if (entries.length > 0) {
          return String(entries[0][1])
        }
      }
      return ""
    }

    const semanticIdValue = getSemanticIdValue()
    const descriptionText = getDescriptionText()

    // UPDATED: Mirror editor right panel layout and controls
    // Helpers for MLP language management (array of { language, text })
    const ensureEnLang = () => {
      updateSelectedElement((el) => {
        if (!Array.isArray(el.value)) el.value = []
        if (!el.value.find((v: any) => v.language === 'en')) {
          el.value.unshift({ language: 'en', text: '' })
        }
      })
    }
    const addLanguageToMLP = (lang: string) => {
      if (!lang) return
      updateSelectedElement((el) => {
        if (!Array.isArray(el.value)) el.value = []
        if (!el.value.find((v: any) => v.language === lang)) {
          el.value.push({ language: lang, text: '' })
        }
      })
    }
    const removeLanguageFromMLP = (lang: string) => {
      if (lang === 'en') return
      updateSelectedElement((el) => {
        if (Array.isArray(el.value)) {
          el.value = el.value.filter((v: any) => v.language !== lang)
        }
      })
    }
    const updateMLPLanguageValue = (lang: string, text: string) => {
      updateSelectedElement((el) => {
        if (!Array.isArray(el.value)) el.value = []
        const entry = el.value.find((v: any) => v.language === lang)
        if (entry) entry.text = text
        else el.value.push({ language: lang, text })
      })
    }
    if (type === "MultiLanguageProperty") ensureEnLang()

    // Derive cardinality and required badge (from qualifier or property)
    let cardinalityValue = "N/A"
    const cardQual = selectedElement.qualifiers?.find((q: any) => q.type === "Cardinality")
    if (cardQual?.value) cardinalityValue = cardQual.value
    else if (selectedElement.cardinality) cardinalityValue = selectedElement.cardinality
    const isRequired = cardinalityValue === "One" || cardinalityValue === "OneToMany"

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Colored header based on element type */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ backgroundColor: hexToRgba(typeColor, 0.15) }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${getBadgeColorClass(type)}`}>
                {getBadgeLabel(type)}
              </span>
              {cardinalityValue !== "N/A" && getCardinalityBadge(cardinalityValue)}
            </div>
          </div>
          <h3
            className="font-semibold text-lg"
            style={{ color: typeColor }}
          >
            {selectedElement.idShort || "Element"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{type}</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* IdShort field (editable when in edit mode) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              IdShort
            </label>
            {editMode ? (
              <div className="space-y-1">
                <Input
                  value={selectedElement.idShort || ""}
                  onChange={(e) => setField("idShort", e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Enter idShort..."
                />
                {(() => {
                  const s = String(selectedElement.idShort || "").trim()
                  const ok = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z]$/.test(s)
                  return !ok ? (
                    <div className="text-[11px] text-red-600">
                      Use letters, digits, "_" or "-"; start with a letter and end with a letter or digit.
                    </div>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                  {selectedElement.idShort || "—"}
                </span>
              </div>
            )}
          </div>

        {/* VALUE section (green) */}
        <div className="space-y-3 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 uppercase">
            Value {isRequired && <span className="text-red-500">*</span>}
          </h4>
          {type === "Property" && (
            editMode ? (
              <Input
                value={typeof selectedElement.value === 'string' ? selectedElement.value : ''}
                onChange={(e) => setField("value", e.target.value)}
                placeholder={`Enter ${selectedElement.idShort}...`}
                className="w-full"
              />
            ) : (
              <div className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                {typeof selectedElement.value === 'string' ? selectedElement.value : ''}
              </div>
            )
          )}
          {type === "MultiLanguageProperty" && (
            <div className="space-y-3">
              {(Array.isArray(selectedElement.value) ? selectedElement.value : []).map((item: any, idx: number) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Language: {item.language || 'en'} ({item.language || 'en'})
                    </label>
                    {editMode ? (
                      <Input
                        value={item.text || ''}
                        onChange={(e) => updateMLPLanguageValue(item.language || 'en', e.target.value)}
                        placeholder={`Enter ${selectedElement.idShort} in ${item.language || 'en'}...`}
                        className="w-full"
                      />
                    ) : (
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {item.text || ''}
                      </div>
                    )}
                  </div>
                  {editMode && (item.language !== 'en') && (
                    <button
                      onClick={() => removeLanguageFromMLP(item.language)}
                      className="mt-6 p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                      title="Remove language"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {editMode && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Add Language
                  </label>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) {
                          addLanguageToMLP(val)
                          e.target.value = ''
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent text-sm"
                    >
                      <option value="">Select language...</option>
                      <option value="de">German (de)</option>
                      <option value="fr">French (fr)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="it">Italian (it)</option>
                      <option value="pt">Portuguese (pt)</option>
                      <option value="nl">Dutch (nl)</option>
                      <option value="pl">Polish (pl)</option>
                      <option value="ru">Russian (ru)</option>
                      <option value="zh">Chinese (zh)</option>
                      <option value="ja">Japanese (ja)</option>
                      <option value="ko">Korean (ko)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          {isCollection && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1">Collection Element</p>
              <p>This element contains child properties. Select its children in the tree to edit their values.</p>
            </div>
          )}
          {type === "File" && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              File path/URL: {typeof selectedElement.value === 'string' ? selectedElement.value : ''}
            </div>
          )}
          {/* Property Value Type selector */}
          {type === "Property" && editMode && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Value Type:
              </label>
              <select
                value={normalizeValueType(selectedElement.valueType) || ''}
                onChange={(e) => setField("valueType", e.target.value || undefined)}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm font-mono"
              >
                <option value="">Select xs:* type...</option>
                {XSD_VALUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* PROPERTY METADATA section (blue) */}
        <div className="space-y-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">
            Property Metadata
          </h4>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Type:
              </label>
              <div className="font-mono text-gray-900 dark:text-gray-100">
                {type}
              </div>
            </div>
            {/* Preferred Name (English) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Preferred Name (English):
              </label>
              <Input
                value={getStringValue(selectedElement.preferredName)}
                onChange={(e) => setField("preferredName", { en: e.target.value })}
                placeholder="Enter preferred name..."
              />
            </div>
            {/* Short Name (English) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Short Name (English):
              </label>
              <Input
                value={getStringValue(selectedElement.shortName)}
                onChange={(e) => setField("shortName", { en: e.target.value })}
                placeholder="Enter short name..."
              />
            </div>
            {/* Unit */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Unit:
              </label>
              <Input
                value={selectedElement.unit || ""}
                onChange={(e) => setField("unit", e.target.value)}
                placeholder="mm, kg, °C, etc."
              />
            </div>
            {/* IEC Data Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Data Type:
              </label>
              <select
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                value={selectedElement.dataType || ""}
                onChange={(e) => setField("dataType", e.target.value || undefined)}
              >
                <option value="">Select data type...</option>
                {IEC_DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {/* Definition/Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Definition/Description:
              </label>
              <Textarea
                value={typeof selectedElement.description === 'string' ? selectedElement.description : (descriptionText === "N/A" ? "" : descriptionText)}
                onChange={(e) => setField("description", e.target.value)}
                rows={3}
              />
            </div>
            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Category:
              </label>
              <select
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                value={selectedElement.category || ""}
                onChange={(e) => setField("category", e.target.value || undefined)}
              >
                <option value="">None</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {/* Cardinality */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Cardinality:
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-gray-900 dark:text-gray-100">{cardinalityValue}</span>
                {cardinalityValue !== "N/A" && (
                  <span className="text-xs text-gray-500">
                    {isRequired ? "(Required)" : "(Optional)"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SEMANTIC ID section (purple) */}
        <div className="p-3 space-y-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">
            Semantic ID (ECLASS/IEC61360)
          </h4>
          <Input
            value={typeof selectedElement.semanticId === 'string' ? selectedElement.semanticId : ''}
            onChange={(e) => setField("semanticId", e.target.value)}
            placeholder="0173-1#02-AAO677#002 or https://..."
            className="font-mono text-xs"
          />
          {semanticIdValue !== "N/A" && semanticIdValue.startsWith('http') && (
            <a
              href={semanticIdValue}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline inline-block mt-1"
            >
              View specification →
            </a>
          )}
          {/* Keys editor for semanticId when it's a Reference object */}
          {selectedElement.semanticId && typeof selectedElement.semanticId === "object" && Array.isArray(selectedElement.semanticId.keys) && (
            <div className="mt-3">
              <KeysEditor
                reference={selectedElement.semanticId}
                editable={editMode}
                onChange={(next) => setField("semanticId", next)}
                title="Semantic ID Keys"
              />
            </div>
          )}
        </div>

        {/* ReferenceElement value keys editor (if applicable) */}
        {type === "ReferenceElement" && selectedElement.value && typeof selectedElement.value === "object" && Array.isArray(selectedElement.value.keys) && (
          <div className="p-3 space-y-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">
              Reference Value (Keys)
            </h4>
            <KeysEditor
              reference={selectedElement.value}
              editable={editMode}
              onChange={(next) => setField("value", next)}
              title="Reference Keys"
              onNavigate={!editMode ? handleKeyNavigate : undefined}
            />
          </div>
        )}

        {/* NEW: Generic keys editors for any other reference-like fields on the element */}
        {Object.entries(selectedElement)
          .filter(
            ([name, val]) =>
              val &&
              typeof val === "object" &&
              Array.isArray((val as any).keys) &&
              name !== "semanticId" &&
              !(type === "ReferenceElement" && name === "value")
          )
          .map(([name, val]) => (
            <div key={name} className="p-3 space-y-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">
                {name} (Keys)
              </h4>
              <KeysEditor
                reference={val as any}
                editable={editMode}
                onChange={(next) => setField(name, next)}
                title={`${name} Keys`}
                onNavigate={!editMode ? handleKeyNavigate : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Get the selected AAS shell
  const shells = aasxData?.assetAdministrationShells || selectedFile?.aasData?.assetAdministrationShells || []
  const currentAAS = selectedShellIndex !== null ? shells[selectedShellIndex] : shells[0]
  const hasMultipleShells = shells.length > 1

  // Filter submodels to those referenced by the current shell (show all if no refs)
  const currentShellRefs: string[] | undefined = currentAAS?.submodelRefs
  const visibleSubmodels = (aasxData?.submodels || []).filter((sm: any) => {
    if (!currentShellRefs || currentShellRefs.length === 0) return true
    return currentShellRefs.includes(sm.id)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top header: larger thumbnail + AAS info + actions */}
      <div className="w-full px-5 py-4 border-b" style={{ backgroundColor: "rgba(97, 202, 243, 0.12)" }}>
        <div className="flex items-center gap-4">
          {/* Larger thumbnail */}
          <div className="w-20 h-20 rounded-lg border border-blue-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
            {selectedFile?.thumbnail ? (
              <img
                src={selectedFile.thumbnail || "/placeholder.svg"}
                alt="AASX Thumbnail"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#61caf3]">
                <FileText className="w-7 h-7" />
              </div>
            )}
          </div>
          {/* AAS Info inline */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            {/* IdShort */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">IdShort</div>
              {aasEditMode ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={currentAAS?.idShort || ""}
                    onChange={(e) => setAASFieldValue('idShort', e.target.value)}
                    className="h-9"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('IdShort', currentAAS?.idShort)} title="Copy IdShort">
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                    {currentAAS?.idShort || 'N/A'}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('IdShort', currentAAS?.idShort)} title="Copy IdShort">
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            {/* ID */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">ID</div>
              {aasEditMode ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={currentAAS?.id || ""}
                    onChange={(e) => setAASFieldValue('id', e.target.value)}
                    className="h-9"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('ID', currentAAS?.id)} title="Copy ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                    {currentAAS?.id || 'N/A'}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('ID', currentAAS?.id)} title="Copy ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            {/* Asset Kind */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Asset Kind</div>
              {aasEditMode ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={currentAAS?.assetKind || ""}
                    onChange={(e) => setAASFieldValue('assetKind', e.target.value)}
                    className="h-9"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Asset Kind', currentAAS?.assetKind)} title="Copy Asset Kind">
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {currentAAS?.assetKind || 'N/A'}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Asset Kind', currentAAS?.assetKind)} title="Copy Asset Kind">
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            {/* Global Asset ID */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Global Asset ID</div>
              {aasEditMode ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={currentAAS?.assetInformation?.globalAssetId || ""}
                    onChange={(e) => setAASFieldValue('globalAssetId', e.target.value)}
                    className="h-9"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Global Asset ID', currentAAS?.assetInformation?.globalAssetId)} title="Copy Global Asset ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                    {currentAAS?.assetInformation?.globalAssetId || 'N/A'}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Global Asset ID', currentAAS?.assetInformation?.globalAssetId)} title="Copy Global Asset ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="lg"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              onClick={runInternalValidation}
            >
              Validate
            </Button>
            <Button
              size="lg"
              variant="default"
              className={(editMode || aasEditMode)
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                : "bg-[#61caf3] hover:bg-[#4db6e6] text-white shadow-md"}
              onClick={() => {
                const next = !(editMode || aasEditMode);
                setEditMode(next);
                setAasEditMode(next);
              }}
            >
              {(editMode || aasEditMode) ? "Done" : "Edit"}
            </Button>
            <Button
              size="lg"
              variant="default"
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              onClick={async () => {
                if (!aasxData) {
                  toast.error("No AAS data to export");
                  return;
                }
                const zip = new JSZip();
                // Save current in-memory environment as model.json
                zip.file("model.json", JSON.stringify(aasxData, null, 2));
                // Include attachments if present
                const attachments = (selectedFile as any)?.attachments as Record<string, string> | undefined;
                if (attachments) {
                  const toBytes = (dataUrl: string) => {
                    const [meta, data] = dataUrl.split(",");
                    const binary = atob(data);
                    const arr = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                    return arr;
                  };
                  Object.entries(attachments).forEach(([path, dataUrl]) => {
                    const normalized = path.replace(/^\/+/, "");
                    zip.file(normalized, toBytes(dataUrl));
                  });
                }
                // Minimal AASX relationships and content types
                zip.file("aasx/aasx-origin", `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/model.json</originPath>
</origin>`);
                zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`);
                zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="text/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="json" ContentType="text/plain"/>
  <Override PartName="/aasx/aasx-origin" ContentType="text/plain"/>
</Types>`);
                const blob = await zip.generateAsync({ type: "blob" });
                const name = (currentAAS?.idShort || selectedFile?.file || "AAS") + ".aasx";
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success("Exported AASX");
              }}
            >
              Export AAS
            </Button>
          </div>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="aasx-overlay-container">
        {/* Left Panel - AAS shells with nested submodels */}
        <div className="aasx-left-panel" style={{ backgroundColor: "rgba(97, 202, 243, 0.1)" }}>
          {shells.length > 0 ? (
            <div className="flex flex-col gap-1 w-full p-1">
              {shells.map((shell: any, shellIdx: number) => {
                const isSelected = selectedShellIndex === shellIdx
                const refs: string[] | undefined = shell.submodelRefs
                const shellSubmodels = (aasxData?.submodels || []).filter((sm: any) => {
                  if (!refs || refs.length === 0) return shells.length === 1
                  return refs.includes(sm.id)
                })
                return (
                  <div key={shell.id || shellIdx} className="w-full">
                    {/* AAS shell header (clickable to select + expand/collapse) */}
                    <button
                      onClick={() => {
                        if (isSelected) {
                          // Toggle collapse
                          setSelectedShellIndex(null)
                        } else {
                          setSelectedShellIndex(shellIdx)
                          setSelectedElement(null)
                          setExpandedNodes(new Set())
                          // Auto-select first submodel of this shell
                          if (shellSubmodels.length > 0) {
                            setSelectedSubmodel(shellSubmodels[0])
                          }
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-[#61caf3]/15 border border-[#61caf3]/40'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent'
                      }`}
                      title={shell.id || `AAS ${shellIdx + 1}`}
                    >
                      {/* Thumbnail */}
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-[#61caf3] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {selectedFile?.thumbnail ? (
                          <img src={selectedFile.thumbnail} alt="" className="w-full h-full rounded-md object-contain" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium truncate ${
                          isSelected ? 'text-[#61caf3]' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {shell.idShort || `AAS ${shellIdx + 1}`}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                          {shellSubmodels.length} submodel{shellSubmodels.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                        isSelected ? 'rotate-90 text-[#61caf3]' : 'text-gray-400'
                      }`} />
                    </button>
                    {/* Nested submodels (shown when AAS is selected) */}
                    {isSelected && (
                      <div className="ml-3 mt-1 flex flex-col gap-1 border-l-2 border-[#61caf3]/20 pl-2">
                        {shellSubmodels.length > 0 ? (
                          shellSubmodels.map((submodel: any, smIdx: number) => (
                            <button
                              key={submodel.id || smIdx}
                              onClick={() => {
                                setSelectedSubmodel(submodel)
                                setSelectedElement(null)
                                setExpandedNodes(new Set())
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
                                selectedSubmodel === submodel
                                  ? 'bg-[#61caf3]/10 text-[#61caf3]'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-400'
                              }`}
                              title={submodel.idShort || `Submodel ${smIdx + 1}`}
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                selectedSubmodel === submodel
                                  ? 'bg-[#61caf3] text-white'
                                  : 'bg-gray-200 dark:bg-gray-700'
                              }`}>
                                <FileText className="w-3 h-3" />
                              </div>
                              <span className="text-xs truncate">
                                {submodel.idShort || `Submodel ${smIdx + 1}`}
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="text-[10px] text-gray-400 px-2 py-1">No submodels</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="aasx-no-selection-message">No AAS found</div>
          )}
        </div>

        {/* Middle Panel - Tree View and Validation Errors */}
        <div className="aasx-middle-panel">
          <div className="aasx-middle-panel-scroll">
            <div className="aasx-middle-panel-content flex flex-col">
              {/* Internal validation panel (Missing Required Fields) */}
              {(internalIssues.length > 0) && (
                <div className="mb-4">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>Missing Required Fields ({internalIssues.length})</span>
                      </div>
                      <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-x border-b border-red-200 dark:border-red-700 rounded-b-lg p-3">
                      <ul className="list-disc list-inside text-sm space-y-2 text-red-800 dark:text-red-200">
                        {internalIssues.map((msg, idx) => (
                          <li key={idx} className="flex items-start justify-between gap-3">
                            <span className="break-words">{msg}</span>
                            <button
                              onClick={() => goToIssuePath(msg)}
                              className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-red-300 dark:border-red-600 rounded hover:bg-red-100 dark:hover:bg-red-800/40"
                            >
                              Go to
                            </button>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {selectedSubmodel ? (
                <>
                  <div className="aasx-submodel-header">
                    <div className="aasx-submodel-header-left">
                      <span className="aasx-submodel-badge">SM</span>
                      <span>{selectedSubmodel.idShort}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Validate button moved to top header */}
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hideEmptyElements}
                          onChange={(e) => setHideEmptyElements(e.target.checked)}
                          className="w-4 h-4 text-[#61caf3] border-gray-300 rounded focus:ring-[#61caf3]"
                        />
                        <span>Hide empty</span>
                      </label>
                      <span className="aasx-submodel-element-count">
                        {isCapabilitySubmodelSelected && capabilityData
                          ? `${capabilityData.capabilities.length} capabilities`
                          : `${selectedSubmodel.submodelElements?.length || 0} elements`}
                      </span>
                    </div>
                  </div>
                  {/* Scrollable tree container */}
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {isCapabilitySubmodelSelected && capabilityData ? (
                      <div className="p-4 grid gap-4">
                        {capabilityData.capabilities.length > 0 ? (
                          capabilityData.capabilities.map((cap) => (
                            <CapabilityCard key={cap.containerIdShort} capability={cap} />
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground">No capabilities found in this submodel.</div>
                        )}
                      </div>
                    ) : (
                      selectedSubmodel.submodelElements?.map((element: any) =>
                        renderTreeNode(element, 0, "", []),
                      )
                    )}
                  </div>
                </>
              ) : (
                <div className="aasx-no-selection-message">Select a submodel to view its elements</div>
              )}

              {/* Validation Errors section (live + fallback) */}
              {(() => {
                const currentErrors = (liveErrors && liveErrors.length > 0) ? liveErrors : (selectedFile?.errors || [])
                const friendly = buildFriendlyErrors(currentErrors as (string | ValidationError)[])
                if (friendly.length === 0) return null
                return (
                  <div className="p-4 mt-4">
                    <Collapsible className="border border-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-red-800 dark:text-red-300 font-semibold">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5" />
                          <span>Validation Errors ({friendly.length})</span>
                        </div>
                        <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t border-red-200 dark:border-red-700 p-3 max-h-[480px] overflow-y-auto">
                        <ul className="space-y-2">
                          {friendly.map((fe, index) => (
                            <li key={index} className="flex items-start justify-between gap-3 p-2 rounded bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700">
                              <div className="text-sm text-red-800 dark:text-red-200">
                                <div className="font-medium">{fe.message}</div>
                                {fe.hint && <div className="text-xs text-red-700/80 dark:text-red-300/80 mt-0.5">{fe.hint}</div>}
                                {fe.path && <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Path: {fe.path}</div>}
                              </div>
                              {fe.path ? (
                                <button
                                  onClick={() => goToIssuePath(fe.path!)}
                                  className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-red-300 dark:border-red-600 rounded hover:bg-red-100 dark:hover:bg-red-800/40"
                                >
                                  Go to
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="aasx-right-panel">{renderDetails()}</div>
      </div>
    </div>
  )
}