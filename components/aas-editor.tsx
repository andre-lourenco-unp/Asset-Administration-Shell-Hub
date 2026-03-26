"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ChevronRight, ChevronDown, Download, ArrowLeft, FileText, Plus, Trash2, X, Upload, GripVertical, Copy, Eye, Wrench, HelpCircle, AlertTriangle, Info, Save, Sparkles, Package, Search, CheckCircle2, ChevronsDownUp, ChevronsUpDown, Home } from 'lucide-react'
// ADD: extra icons and UI + toast
import { AlertCircle, CheckCircle } from 'lucide-react'
import { FileDown } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import JSZip from 'jszip'
import { validateAASXXml } from "@/lib/xml-validator" // Import the XML validation function
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
import { processFile } from "@/lib/process-file"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validateAASXJson } from "@/lib/json-validator"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
// NEW: Improved validation imports
import { AlertType, ValidationAlert, ALERT_COLORS, countAlertsByType, countFixableAlerts } from "@/lib/validation-types"
import { ValidationDialog, ValidationSummary } from "@/components/ui/validation-dialog"
import { ValidationBadge, ValidationStatus } from "@/components/ui/validation-badge"
import { ValidatedField, ValidatedFieldWrapper, FieldHelp, AAS_FIELD_HELP } from "@/components/ui/validated-field"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchTemplates, fetchTemplateJson, isRateLimited, rateLimitResetSeconds } from "@/lib/github-templates"
import { createPropertyConstraintContainer } from "@/lib/element-factory"
import { EClassPicker } from "@/components/eclass-picker"
import { SUBMODEL_TEMPLATES } from "@/lib/templates"
import type { SubmodelTemplate as LocalSubmodelTemplate } from "@/lib/templates"
import {
  IEC_DATA_TYPES,
  XSD_VALUE_TYPES,
  XSD_CANON_MAP,
  AAS_NAMESPACE_3_1,
  normalizeValueType,
  escapeXml,
  deriveValueTypeFromIEC,
  isValidValueForXsdType,
} from "@/lib/constants"

// Use the centralized AAS 3.1 namespace constant
const ns31 = AAS_NAMESPACE_3_1;

interface SubmodelTemplate {
  name: string
  version: string
  description: string
  url: string
}

interface SelectedSubmodel {
  template: SubmodelTemplate
  idShort: string
  submodelId?: string // unique submodel ID (URI) for multi-AAS dedup
}

interface AASShell {
  idShort: string
  id: string
  assetKind: "Instance" | "Type"
  globalAssetId: string
  submodelIds: string[] // unique submodel IDs that belong to this shell
}

interface AASConfig {
  idShort: string
  id: string
  assetKind: "Instance" | "Type" // Added assetKind
  globalAssetId: string // Added globalAssetId
  selectedSubmodels: SelectedSubmodel[]
  shells?: AASShell[] // multiple shells (optional for backward compat)
}

// All supported AAS SubmodelElement types
type SubmodelElementModelType =
  | "Property"
  | "MultiLanguageProperty"
  | "SubmodelElementCollection"
  | "SubmodelElementList"
  | "File"
  | "Blob"
  | "Range"
  | "ReferenceElement"
  | "Entity"
  | "Capability"
  | "Operation"
  | "BasicEventElement"
  | "RelationshipElement"
  | "AnnotatedRelationshipElement"

interface SubmodelElement {
  idShort: string
  modelType: SubmodelElementModelType
  valueType?: string // For Property, Range
  value?: string | Record<string, string> | any // For Property, MultiLanguageProperty, File, Range, etc.
  cardinality: "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany"
  description?: string
  semanticId?: string | { keys?: { value?: string }[] }
  children?: SubmodelElement[] // Explicitly for SubmodelElementCollection, SubmodelElementList
  preferredName?: string | Record<string, string>
  shortName?: string | Record<string, string>
  dataType?: string
  unit?: string
  category?: string
  fileData?: { content: string; mimeType: string; fileName: string } // For File
  // Range-specific
  min?: string
  max?: string
  // Entity-specific
  entityType?: "CoManagedEntity" | "SelfManagedEntity"
  globalAssetId?: string
  // Blob-specific
  contentType?: string
  // ReferenceElement and relationships
  first?: any // for RelationshipElement
  second?: any // for RelationshipElement
  // Qualifiers (e.g. CapabilityRoleQualifiers)
  qualifiers?: Array<{ type: string; valueType: string; value: string; semanticId?: string }>
}

interface AASEditorProps {
  aasConfig: AASConfig
  onBack: () => void
  onFileGenerated?: (file: ValidationResult) => void
  onUpdateAASConfig: (newConfig: AASConfig) => void
  initialSubmodelData?: Record<string, SubmodelElement[]>
  onSave?: (file: ValidationResult) => void
  initialThumbnail?: string | null
  // NEW: pass original uploaded XML to align Validate and Preview with home/upload
  sourceXml?: string
  // NEW: attachments from the uploaded AASX (path -> data URL)
  attachments?: Record<string, string>
}

export function AASEditor({ aasConfig, onBack, onFileGenerated, onUpdateAASConfig, initialSubmodelData, onSave, initialThumbnail, sourceXml, attachments }: AASEditorProps) {
  const [submodelData, setSubmodelData] = useState<Record<string, SubmodelElement[]>>(() => {
    const initial: Record<string, SubmodelElement[]> = {}
    aasConfig.selectedSubmodels.forEach((sm) => {
      initial[sm.idShort] =
        (initialSubmodelData && initialSubmodelData[sm.idShort])
          ? initialSubmodelData[sm.idShort]
          : generateTemplateStructure(sm.template.name)
    })
    return initial
  })
  
  const [selectedSubmodel, setSelectedSubmodel] = useState<SelectedSubmodel | null>(
    aasConfig.selectedSubmodels[0] || null
  )
  const [selectedShellIndex, setSelectedShellIndex] = useState<number | null>(0)
  const [selectedElement, setSelectedElement] = useState<SubmodelElement | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [showAddSubmodel, setShowAddSubmodel] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<SubmodelTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set())
  const [thumbnail, setThumbnail] = useState<string | null>(initialThumbnail || null)
// Edit mode always on — right panel and AAS fields are always editable
  const editMode = true
  const [templateSearchQuery, setSearchQuery] = useState("")
  const [draggedItem, setDraggedItem] = useState<{ path: string[]; element: SubmodelElement } | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragOverContainer, setDragOverContainer] = useState<string | null>(null) // For nesting into SMC/SML/Entity

  const [isGenerating, setIsGenerating] = useState(false)
  // ADD: validation issue states
  const [internalIssues, setInternalIssues] = useState<string[]>([])
  const [externalIssues, setExternalIssues] = useState<string[]>([])
  const [lastGeneratedXml, setLastGeneratedXml] = useState<string | null>(null)
  // ADD: original uploaded XML if provided
  const [originalXml, setOriginalXml] = useState<string | null>(sourceXml ?? null)
  // New: gate generation until a successful validation
  const [canGenerate, setCanGenerate] = useState(false)
  // New: track whether validation has been run (and is current)
  const [hasValidated, setHasValidated] = useState(false)
  const [downloadingPdfs, setDownloadingPdfs] = useState(false) // used as "preparing" spinner
  const [noPdfsDialogOpen, setNoPdfsDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [pdfEntries, setPdfEntries] = useState<{ name: string; bytes: Uint8Array; url: string }[]>([])
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set())
  // ADD: keep raw XML errors (objects with message + loc.lineNumber) to derive paths and hints
  const [xmlErrorsRaw, setXmlErrorsRaw] = useState<any[]>([])
  // Validation result dialog state
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationDialogStatus, setValidationDialogStatus] = useState<'valid' | 'invalid'>('invalid')
  const [validationCounts, setValidationCounts] = useState<{ internal: number; json: number; xml: number }>({
    internal: 0,
    json: 0,
    xml: 0,
  })
  const [validationDialogDismissed, setValidationDialogDismissed] = useState(false)
  // Add UI state for fixing/validation busy (near other useState declarations)
  const [isFixing, setIsFixing] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);

  // NEW: Improved validation alerts with severity levels
  const [validationAlerts, setValidationAlerts] = useState<ValidationAlert[]>([]);

  // Add a reentrancy guard ref if not present already
  const validationRunningRef = useRef(false);
  // Tracks the XML content of the last auto-save so we only call onSave when something changed
  const lastAutoSavedXmlRef = useRef<string | null>(null);

  // Constraint editing form state
  const [showConstraintForm, setShowConstraintForm] = useState(false);
  const [constraintIdShort, setConstraintIdShort] = useState("");
  const [constraintType, setConstraintType] = useState<"BasicConstraint" | "CustomConstraint" | "OCLConstraint" | "OperationConstraint">("BasicConstraint");
  const [constraintValue, setConstraintValue] = useState("");
  const [constraintConditionalType, setConstraintConditionalType] = useState("Precondition");
  const [constraintTargetProperty, setConstraintTargetProperty] = useState("");

  // NEW: Add Element dialog state
  const [showAddElementDialog, setShowAddElementDialog] = useState(false);
  const [addElementStep, setAddElementStep] = useState<1 | 2>(1);
  const [addElementParentPath, setAddElementParentPath] = useState<string[] | null>(null); // null means root level
  const [newElementType, setNewElementType] = useState<SubmodelElementModelType | "CapabilityName">("Property");
  const [newElementIdShort, setNewElementIdShort] = useState("");
  const [newElementCardinality, setNewElementCardinality] = useState<"One" | "ZeroToOne" | "ZeroToMany" | "OneToMany">("ZeroToOne");
  const [newElementDescription, setNewElementDescription] = useState("");
  const [newElementSemanticId, setNewElementSemanticId] = useState("");
  const [newElementValueType, setNewElementValueType] = useState("xs:string");
  const [newElementEntityType, setNewElementEntityType] = useState<"CoManagedEntity" | "SelfManagedEntity">("CoManagedEntity");

  // NEW: Unsaved changes tracking
  const { hasUnsavedChanges, markAsSaved, confirmNavigation } = useUnsavedChanges(
    { submodelData, aasConfig },
    { warningMessage: "You have unsaved changes. Are you sure you want to leave?" }
  );

  // Sync sourceXml prop to originalXml state when prop changes
  useEffect(() => {
    if (sourceXml && sourceXml.trim().length > 0) {
      setOriginalXml(sourceXml);
    }
  }, [sourceXml]);

  // On mount: fetch real template structures for submodels that were initialized with the fallback
  // (i.e., when coming from the Creator wizard, which doesn't pass initialSubmodelData)
  useEffect(() => {
    const submodelsNeedingFetch = aasConfig.selectedSubmodels.filter(
      sm => !initialSubmodelData?.[sm.idShort]
    )
    if (submodelsNeedingFetch.length === 0) return

    const fetchAll = async () => {
      for (const sm of submodelsNeedingFetch) {
        const fetched = await fetchTemplateDetails(sm.template.name)
        if (fetched) {
          setSubmodelData(prev => ({
            ...prev,
            [sm.idShort]: fetched,
          }))
        }
      }
    }
    fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // NEW: Tree search and navigation
  // treeSearchQuery is the debounced value used for filtering (avoids re-rendering the tree on every keystroke)
  const [treeSearchQuery, setTreeSearchQuery] = useState("");
  const [treeSearchInput, setTreeSearchInput] = useState("");
  const [treeSearchFocused, setTreeSearchFocused] = useState(false);
  const treeSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Breadcrumb path for selected element
  const [selectedElementPath, setSelectedElementPath] = useState<string[]>([]);

  // Helper: collect all node IDs recursively for expand/collapse all
  const collectAllNodeIds = useCallback((elements: SubmodelElement[], parentPath: string[] = []): string[] => {
    const ids: string[] = [];
    elements.forEach((el) => {
      const path = [...parentPath, el.idShort];
      const nodeId = path.join('/');
      ids.push(nodeId);
      if (el.children && el.children.length > 0) {
        ids.push(...collectAllNodeIds(el.children, path));
      }
    });
    return ids;
  }, []);

  // Expand all nodes in current submodel
  const expandAll = useCallback(() => {
    if (!selectedSubmodel) return;
    const elements = submodelData[selectedSubmodel.idShort] || [];
    const allIds = collectAllNodeIds(elements);
    setExpandedNodes(new Set(allIds));
  }, [selectedSubmodel, submodelData, collectAllNodeIds]);

  // Collapse all nodes
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Filter elements by search query (recursive)
  const filterElementsBySearch = useCallback((elements: SubmodelElement[], query: string): SubmodelElement[] => {
    if (!query.trim()) return elements;
    const q = query.toLowerCase();
    const matches = (el: SubmodelElement): boolean => {
      if (el.idShort.toLowerCase().includes(q)) return true;
      if (el.children && el.children.some(c => matches(c))) return true;
      return false;
    };
    return elements.filter(matches);
  }, []);

  // Get filtered elements for current submodel
  const filteredElements = useMemo(() => {
    if (!selectedSubmodel) return [];
    const elements = submodelData[selectedSubmodel.idShort] || [];
    return filterElementsBySearch(elements, treeSearchQuery);
  }, [selectedSubmodel, submodelData, treeSearchQuery, filterElementsBySearch]);

  // Check if an element matches search (for highlighting)
  const elementMatchesSearch = useCallback((idShort: string): boolean => {
    if (!treeSearchQuery.trim()) return false;
    return idShort.toLowerCase().includes(treeSearchQuery.toLowerCase());
  }, [treeSearchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F - Focus tree search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setTreeSearchFocused(true);
      }
      // Delete - Remove selected element (when not in input)
      if (e.key === 'Delete' && selectedElement && editMode) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          // Delete would require the path - skipped for now as complex
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, editMode]);

  // Any change to AAS content should require re-validation
  useEffect(() => {
    setCanGenerate(false)
    setHasValidated(false)
  }, [submodelData, aasConfig.idShort, aasConfig.id, aasConfig.assetKind, aasConfig.globalAssetId, aasConfig.selectedSubmodels])

  // Helper: convert base64 dataURL to Uint8Array
  const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(",")[1] || ""
    const binary = atob(base64)
    const buf = new ArrayBuffer(binary.length)
    const arr = new Uint8Array(buf)
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
    return arr
  }

  // Helper: try decode URL-safe base64 strings (used by some file values)
  const tryDecodeBase64 = (s: string): string | null => {
    try {
      const normalized = s.replace(/-/g, "+").replace(/_/g, "/")
      const pad = normalized.length % 4
      const padded = pad ? normalized + "=".repeat(4 - pad) : normalized
      return atob(padded)
    } catch {
      return null
    }
  }
  const normalizePath = (p: string) =>
    p.replace(/^file:\/\//i, "").replace(/^file:\//i, "").replace(/^\/+/, "")
  // EXTRA: helpers to strip query/fragment, fix slashes and decode URI components
  const stripQueryAndFragment = (p: string) => p.replace(/[?#].*$/, "")
  const fixSlashes = (p: string) => p.replace(/\\/g, "/")
  const tryDecodeUri = (s: string): string => {
    try { return decodeURIComponent(s) } catch { return s }
  }
  const deriveBasename = (p: string): string => {
    const cleaned = stripQueryAndFragment(fixSlashes(p))
    let base = cleaned.split("/").pop() || cleaned
    // Handle AASX "File-" naming pattern (e.g., ".../File-Manual.pdf")
    const idx = cleaned.lastIndexOf("File-")
    if (idx >= 0) {
      const tail = cleaned.slice(idx + "File-".length)
      if (/\.[a-z0-9]{2,5}$/i.test(tail)) base = tail
    }
    return base
  }

  // Collect all PDF files from the current model
  const collectAllPdfs = (): { name: string; bytes: Uint8Array }[] => {
    const pdfs: { name: string; bytes: Uint8Array }[] = []

    const fromAttachments = (raw: string): { name: string; bytes: Uint8Array } | null => {
      const att = attachmentsState || attachments
      if (!att) return null
      let candidate = raw.trim()
      if (!candidate) return null
      const decoded = tryDecodeBase64(candidate)
      if (decoded) candidate = decoded.trim()
      if (/^data:/i.test(candidate)) {
        if (/^data:application\/pdf/i.test(candidate)) {
          return { name: "document.pdf", bytes: dataUrlToUint8(candidate) }
        }
        return null
      }
      candidate = tryDecodeUri(candidate)
      const norm = normalizePath(stripQueryAndFragment(fixSlashes(candidate)))
      const basename = deriveBasename(norm)
      const searchKeys = [
        norm,
        `/${norm}`,
        basename,
        `/${basename}`,
        `aasx/${basename}`,
        `/aasx/${basename}`,
        `aasx/Document/${basename}`,
        `/aasx/Document/${basename}`,
      ]
      let foundKey: string | undefined
      for (const key of searchKeys) {
        if (att[key]) { foundKey = key; break }
      }
      if (!foundKey) {
        const kv = Object.entries(att).find(([k]) => {
          const lk = k.toLowerCase()
          const bb = basename.toLowerCase()
          return lk.endsWith(`/${bb}`) || lk === bb
        })
        if (kv) foundKey = kv[0]
      }
      if (!foundKey) return null
      const dataUrl = att[foundKey]
      const isPdfMime = /^data:application\/pdf/i.test(dataUrl)
      const looksPdf = /\.pdf$/i.test(foundKey) || /\.pdf$/i.test(basename)
      if (!isPdfMime && !looksPdf) return null
      const name = basename || (foundKey.split("/").pop() || "document.pdf")
      return { name, bytes: dataUrlToUint8(dataUrl) }
    }

    const walk = (els: SubmodelElement[]) => {
      els.forEach((el) => {
        if (el.modelType === "File") {
          const rawVal = typeof el.value === "string" ? el.value : ""
          const mime = (el.fileData?.mimeType || "").toLowerCase()
          const lowerVal = rawVal.toLowerCase()

          // Priority 1: fileData content available from editor uploads
          if (el.fileData?.content && (mime === "application/pdf" || /\.pdf$/.test(lowerVal))) {
            const name = el.fileData.fileName?.trim() || `${el.idShort || "document"}.pdf`
            pdfs.push({ name, bytes: dataUrlToUint8(el.fileData.content) })
          } else if (rawVal && /^data:application\/pdf/i.test(rawVal)) {
            // Priority 2: direct data URL in value
            const name = `${el.idShort || "document"}.pdf`
            pdfs.push({ name, bytes: dataUrlToUint8(rawVal) })
          } else if (rawVal) {
            // Priority 3: resolve via attachments from original AASX
            const resolved = fromAttachments(rawVal)
            if (resolved) pdfs.push(resolved)
          }
        }
        if (el.children && el.children.length) walk(el.children)
      })
    }

    aasConfig.selectedSubmodels.forEach((sm) => {
      const elements = submodelData[sm.idShort] || []
      walk(elements)
    })
    // FALLBACK: if no File nodes referenced PDFs but archive contains PDFs, include them
    if (pdfs.length === 0 && attachments) {
      Object.entries(attachments).forEach(([path, dataUrl]) => {
        const isPdf = /^data:application\/pdf/i.test(dataUrl) || /\.pdf$/i.test(path)
        if (isPdf) {
          const name = deriveBasename(path) || "document.pdf"
          pdfs.push({ name, bytes: dataUrlToUint8(dataUrl) })
        }
      })
    }
    return pdfs
  }

  // Prepare and open the PDF selection dialog
  const openPdfDialog = async () => {
    setDownloadingPdfs(true)
    const pdfs = collectAllPdfs()
    if (pdfs.length === 0) {
      setNoPdfsDialogOpen(true)
      setDownloadingPdfs(false)
      return
    }
    // Build blob URLs for preview
    const entries = pdfs.map((p) => {
      const blob = new Blob([p.bytes as BlobPart], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      return { name: p.name, bytes: p.bytes, url }
    })
    setPdfEntries(entries)
    setPdfSelected(new Set(entries.map(e => e.name))) // default: select all
    setPdfDialogOpen(true)
    setDownloadingPdfs(false)
  }

  // Revoke blob URLs when dialog closes
  const closePdfDialog = () => {
    pdfEntries.forEach((e) => URL.revokeObjectURL(e.url))
    setPdfEntries([])
    setPdfSelected(new Set())
    setPdfDialogOpen(false)
  }

  // Toggle selection for a single PDF
  const togglePdfSelection = (name: string, checked: boolean) => {
    setPdfSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  // Toggle select all
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setPdfSelected(new Set(pdfEntries.map(e => e.name)))
    } else {
      setPdfSelected(new Set())
    }
  }

  // Download only selected PDFs
  const downloadSelectedPdfs = async () => {
    const selectedNames = Array.from(pdfSelected)
    if (selectedNames.length === 0) {
      toast.error("Select at least one PDF to download.")
      return
    }
    const zip = new JSZip()
    pdfEntries.forEach((e) => {
      if (pdfSelected.has(e.name)) {
        zip.file(`pdfs/${e.name}`, e.bytes)
      }
    })
    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${aasConfig.idShort || "model"}-pdfs-selected.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${selectedNames.length} PDF${selectedNames.length > 1 ? "s" : ""}.`)
    closePdfDialog()
  }

  const loadTemplates = async () => {
    if (availableTemplates.length > 0) return

    setLoadingTemplates(true)
    try {
      const { templates, jsonUrls, rateLimited } = await fetchTemplates()

      if (rateLimited && templates.length === 0) {
        const secs = rateLimitResetSeconds()
        toast.error(
          `GitHub API rate limit reached. Please wait ${secs > 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`} and try again.`
        )
        return
      }
      if (rateLimited) {
        toast.info("Using cached templates — GitHub API rate limit reached")
      }

      // Ensure Capability Description is always available
      const hasCapability = templates.some(t => t.name === 'CapabilityDescription')
      const merged = hasCapability
        ? templates
        : [
            ...templates,
            {
              name: 'CapabilityDescription',
              version: '1.0',
              description: 'IDTA 02020-1-0 Capability Description submodel — describes offered/required capabilities with properties and constraints',
              url: 'https://admin-shell.io/idta/CapabilityDescription/1/0/Submodel',
            },
          ]
      setAvailableTemplates(merged)
    } catch (error) {
      console.error("Failed to load templates:", error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchTemplateDetails = async (templateName: string): Promise<SubmodelElement[] | null> => {
    try {
      const rawElements = await fetchTemplateJson(templateName)
      if (rawElements) {
        return parseSubmodelElements(rawElements)
      }
      return null
    } catch (error) {
      console.error("Error fetching template details:", error)
      return null
    }
  }

  const parseSubmodelElements = (elements: any[]): SubmodelElement[] => {
    return elements.map(el => {
      const embeddedDataSpec = el.embeddedDataSpecifications?.[0]?.dataSpecificationContent

      const element: SubmodelElement = {
        idShort: el.idShort || "UnknownElement",
        modelType: el.modelType || "Property",
        valueType: el.valueType,
        value: el.modelType === "MultiLanguageProperty" ? { en: "" } : (el.modelType === "Property" || el.modelType === "File" ? "" : undefined),
        cardinality: determineCardinality(el),
        description: getDescription(el),
        semanticId: getSemanticId(el),
        preferredName: embeddedDataSpec?.preferredName,
        shortName: embeddedDataSpec?.shortName,
        dataType: embeddedDataSpec?.dataType,
        unit: embeddedDataSpec?.unit,
        category: el.category,
      }

      // Preserve type-specific fields from template
      if (el.modelType === "Range") {
        element.min = el.min ?? ""
        element.max = el.max ?? ""
      }
      if (el.modelType === "Entity") {
        element.entityType = el.entityType
        element.globalAssetId = el.globalAssetId
      }
      if (el.modelType === "File" || el.modelType === "Blob") {
        element.contentType = el.contentType
      }
      if (el.modelType === "RelationshipElement" || el.modelType === "AnnotatedRelationshipElement") {
        element.first = el.first
        element.second = el.second
      }

      // Parse children: check children, value (SMC/SML), statements (Entity), annotations (AnnotatedRelationshipElement)
      if (Array.isArray(el.children)) {
        element.children = parseSubmodelElements(el.children)
      } else if (Array.isArray(el.value)) {
        element.children = parseSubmodelElements(el.value)
      } else if (Array.isArray(el.statements)) {
        // Entity uses 'statements' for its children in AAS JSON
        element.children = parseSubmodelElements(el.statements)
      }

      // AnnotatedRelationshipElement annotations as additional children
      if (el.modelType === "AnnotatedRelationshipElement" && Array.isArray(el.annotations)) {
        const annotationChildren = parseSubmodelElements(el.annotations)
        element.children = element.children ? [...element.children, ...annotationChildren] : annotationChildren
      }

      return element
    })
  }

  const getSemanticId = (element: any): string | undefined => {
    if (element.semanticId) {
      // Handle string semanticId directly
      if (typeof element.semanticId === 'string') {
        return element.semanticId.trim() || undefined
      }

      // Handle Reference object structure: { type, keys: [{ type, value }] }
      if (typeof element.semanticId === 'object' && element.semanticId !== null) {
        // Try keys array (standard AAS 3.x structure)
        if (element.semanticId.keys && Array.isArray(element.semanticId.keys) && element.semanticId.keys.length > 0) {
          const key = element.semanticId.keys[0]
          if (typeof key === 'string') {
            return key.trim() || undefined
          }
          if (typeof key === 'object' && key !== null && key.value) {
            const val = String(key.value).trim()
            return val || undefined
          }
        }

        // Try singular 'key' property (some templates use this)
        if (element.semanticId.key && Array.isArray(element.semanticId.key) && element.semanticId.key.length > 0) {
          const key = element.semanticId.key[0]
          if (typeof key === 'string') {
            return key.trim() || undefined
          }
          if (typeof key === 'object' && key !== null && key.value) {
            const val = String(key.value).trim()
            return val || undefined
          }
        }

        // Try direct value property (legacy format)
        if (element.semanticId.value && typeof element.semanticId.value === 'string') {
          return element.semanticId.value.trim() || undefined
        }

        // Try id property (some formats use this)
        if (element.semanticId.id && typeof element.semanticId.id === 'string') {
          return element.semanticId.id.trim() || undefined
        }
      }
    }
    return undefined
  }

  const getDescription = (element: any): string | undefined => {
    if (element.embeddedDataSpecifications && Array.isArray(element.embeddedDataSpecifications)) {
      const dataSpec = element.embeddedDataSpecifications.find((ds: any) => ds.dataSpecification?.type === "DataSpecificationIEC61360")
      if (dataSpec?.dataSpecificationContent?.definition) {
        const definition = dataSpec.dataSpecificationContent.definition
        if (Array.isArray(definition)) {
          const enDef = definition.find((d: any) => d.language === 'en')
          const text = enDef?.text || definition[0]?.text || ''
          // Ensure we return a string
          return typeof text === 'string' ? text : String(text)
        }
        // If definition is a string, return it
        if (typeof definition === 'string') {
          return definition
        }
      }
    }
    
    // Fallback to description field
    if (element.description) {
      if (typeof element.description === 'string') {
        return element.description
      }
      if (Array.isArray(element.description)) {
        const enDesc = element.description.find((d: any) => d.language === 'en')
        const text = enDesc?.text || element.description[0]?.text || ''
        // Ensure we return a string
        return typeof text === 'string' ? text : String(text)
      }
      // If it's an object but not an array, try to convert to string
      if (typeof element.description === 'object') {
        return ''
      }
    }
    return undefined
  }

  const determineCardinality = (element: any): "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany" => {
    // Check for explicit cardinality in template
    if (element.cardinality) {
      return element.cardinality
    }
    
    // Infer from qualifiers or constraints
    const qualifiers = element.qualifiers || []
    const multiplicity = qualifiers.find((q: any) => q.type === "Multiplicity")
    
    if (multiplicity) {
      const value = multiplicity.value
      if (value === "One") return "One"
      if (value === "ZeroToOne") return "ZeroToOne"
      if (value === "ZeroToMany" || value === "*") return "ZeroToMany"
      if (value === "OneToMany") return "OneToMany"
    }
    
    // Default to ZeroToOne for optional elements
    return "ZeroToOne"
  }

  function generateTemplateStructure(templateName: string, templateUrl?: string): SubmodelElement[] {
    // Match by semantic ID (url) first, fall back to exact name match
    const matchUrl = (url: string) => templateUrl === url
    const matchName = (...names: string[]) => names.includes(templateName)

    if (matchUrl('https://admin-shell.io/zvei/nameplate/2/0/Nameplate') || matchName("Digital Nameplate", "Nameplate")) {
      return [
        { idShort: "URIOfTheProduct", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Unique global identification of the product using a universal resource identifier (URI)", semanticId: "0173-1#02-AAY811#001" },
        { idShort: "ManufacturerName", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "legally valid designation of the natural or judicial person which is directly responsible for the design, production, packaging and labeling of a product in respect to its being brought into circulation", semanticId: "0173-1#02-AAO677#002" },
        { idShort: "ManufacturerProductDesignation", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Short description of the product (short text)", semanticId: "0173-1#02-AAW338#001" },
        { 
          idShort: "AddressInformation", 
          modelType: "SubmodelElementCollection", 
          cardinality: "ZeroToOne", 
          description: "Address information of a business partner",
          semanticId: "0173-1#02-AAQ832#005",
          children: [
            { idShort: "Street", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Street name and house number", semanticId: "0173-1#02-AAO128#002" },
            { idShort: "Zipcode", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "ZIP code of address", semanticId: "0173-1#02-AAO129#002" },
            { idShort: "CityTown", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "town or city", semanticId: "0173-1#02-AAO132#002" },
            { idShort: "Country", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "country code", semanticId: "0173-1#02-AAO134#002" },
          ]
        },
        { idShort: "ManufacturerProductRoot", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "ZeroToOne", description: "Top level of a 3 level manufacturer specific product hierarchy", semanticId: "0173-1#02-AAU732#001" },
        { idShort: "ManufacturerProductFamily", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "ZeroToOne", description: "2nd level of a 3 level manufacturer specific product hierarchy", semanticId: "0173-1#02-AAU731#001" },
        { idShort: "ManufacturerProductType", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Characteristic to differentiate between different products of a product family or special variants", semanticId: "0173-1#02-AAO057#002" },
        { idShort: "OrderCodeOfManufacturer", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "By manufactures issued unique combination of numbers and letters used to order the product", semanticId: "0173-1#02-AAO227#002" },
        { idShort: "ProductArticleNumberOfManufacturer", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "unique product identifier of the manufacturer for the product type to which the serialized product belongs", semanticId: "0173-1#02-AAO676#003" },
        { idShort: "SerialNumber", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "unique combination of numbers and letters used to identify the device once it has been manufactured", semanticId: "0173-1#02-AAM556#002" },
        { idShort: "YearOfConstruction", modelType: "Property", valueType: "integer", value: "", cardinality: "ZeroToOne", description: "Year as completion date of object", semanticId: "0173-1#02-AAP906#001" },
        { idShort: "DateOfManufacture", modelType: "Property", valueType: "date", value: "", cardinality: "ZeroToOne", description: "Date from which the production and / or development process is completed or from which a service is provided completely", semanticId: "0173-1#02-AAR972#002" },
        { idShort: "HardwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Version of the hardware supplied with the device", semanticId: "0173-1#02-AAN270#002" },
        { idShort: "FirmwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "version of the firmware supplied with the device", semanticId: "0173-1#02-AAN269#002" },
        { idShort: "SoftwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Version of the software used by the device", semanticId: "0173-1#02-AAN271#002" },
        { idShort: "CountryOfOrigin", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Country where the product was manufactured", semanticId: "0173-1#02-AAO259#004" },
        { idShort: "CompanyLogo", modelType: "File", value: "", cardinality: "ZeroToOne", description: "A graphic mark used to represent a company, an organisation or a product", semanticId: "0173-1#02-AAQ163#002" },
        {
          idShort: "Markings",
          modelType: "SubmodelElementCollection", // Changed from SubmodelElementList
          cardinality: "ZeroToOne",
          description: "Collection of product markings",
          semanticId: "0173-1#01-AHD492#001",
          children: [
            // Removed nested Marking collection, now direct properties
            { idShort: "MarkingName", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "common name of the marking", semanticId: "0173-1#02-AAU734#001" },
            { idShort: "DesignationOfCertificateOrApproval", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "alphanumeric character sequence identifying a certificate or approval", semanticId: "0173-1#02-AAO200#002" },
            { idShort: "MarkingFile", modelType: "File", value: "", cardinality: "ZeroToOne", description: "picture or document of the marking", semanticId: "0173-1#02-AAU733#001" },
          ]
        },
        {
          idShort: "AssetSpecificProperties",
          modelType: "SubmodelElementCollection",
          cardinality: "ZeroToOne",
          description: "Group of properties that are listed on the asset's nameplate and have to be reported to a authority",
          children: [
            {
              idShort: "GuidelineSpecificProperties",
              modelType: "SubmodelElementCollection",
              cardinality: "ZeroToOne",
              description: "Properties specific to the guideline",
              children: [
                { idShort: "GuidelineForConformityDeclaration", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Guideline, regulation or rule, which was followed to issue a declaration of conformity", semanticId: "0173-1#02-AAO640#002" },
              ]
            }
          ]
        }
      ]
    }
    
    if (matchUrl('https://admin-shell.io/zvei/contact/1/0/Contact') || matchName("Contact Information", "Contact")) {
      return [
        { idShort: "RoleOfContactPerson", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Role of contact person", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/RoleOfContactPerson" },
        { idShort: "NameOfContact", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Name of contact", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/NameOfContact" },
        { idShort: "FirstName", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "First name", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/FirstName" },
        { idShort: "MiddleNames", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Middle names", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/MiddleNames" },
        { idShort: "Title", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Academic title", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Title" },
        { idShort: "Email", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Email address", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Email" },
        { idShort: "Phone", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Phone number", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Phone" },
        { idShort: "Fax", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Fax number", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Fax" },
      ]
    }
    
    if (matchUrl('https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2') || matchName("TechnicalData", "Technical Data")) {
      return [
        { idShort: "GeneralInformation", modelType: "SubmodelElementCollection", cardinality: "One", description: "General technical information",
          semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/GeneralInformation",
          children: [
            { idShort: "ManufacturerName", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Manufacturer name", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerName" },
            { idShort: "ManufacturerProductDesignation", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Product designation", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerProductDesignation" },
            { idShort: "ManufacturerPartNumber", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Part number", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerPartNumber" },
          ]
        },
        { idShort: "TechnicalProperties", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne", description: "Technical properties",
          semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/TechnicalProperties",
          children: [
            { idShort: "NominalVoltage", modelType: "Property", valueType: "float", value: "", cardinality: "ZeroToOne", description: "Nominal voltage", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/NominalVoltage" },
            { idShort: "NominalCurrent", modelType: "Property", valueType: "float", value: "", cardinality: "ZeroToOne", description: "Nominal current", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/NominalCurrent" },
          ]
        },
      ]
    }
    
    if (matchUrl('https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/0/9') || matchName("CarbonFootprint", "Carbon Footprint")) {
      return [
        { idShort: "PCF", modelType: "SubmodelElementCollection", cardinality: "One", description: "Product Carbon Footprint",
          semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCF",
          children: [
            { idShort: "PCFCalculationMethod", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Calculation method", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFCalculationMethod" },
            { idShort: "PCFCO2eq", modelType: "Property", valueType: "float", value: "", cardinality: "One", description: "CO2 equivalent in kg", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFCO2eq" },
            { idShort: "PCFReferenceValueForCalculation", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Reference value", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFReferenceValueForCalculation" },
          ]
        },
      ]
    }
    
    if (matchUrl('https://admin-shell.io/idta/CapabilityDescription/1/0/Submodel') || matchName("CapabilityDescription", "Capability Description")) {
      return [
        { idShort: "CapabilitySet", modelType: "SubmodelElementCollection", cardinality: "OneToMany", description: "Set of capabilities",
          semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilitySet/1/0",
          children: [
            { idShort: "CapabilityName", modelType: "SubmodelElementCollection", cardinality: "One", description: "A named capability container",
              children: [
                { idShort: "Capability1", modelType: "Capability", cardinality: "One", description: "The capability element",
                  qualifiers: [
                    { type: "CapabilityRoleQualifier/Offered", valueType: "xs:boolean", value: "false", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Offered/1/0" },
                    { type: "CapabilityRoleQualifier/Required", valueType: "xs:boolean", value: "false", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Required/1/0" },
                    { type: "CapabilityRoleQualifier/NotAssigned", valueType: "xs:boolean", value: "true", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/NotAssigned/1/0" },
                  ] },
                { idShort: "CapabilityComment", modelType: "MultiLanguageProperty", cardinality: "ZeroToOne", description: "Comment about this capability" },
                { idShort: "PropertySet", modelType: "SubmodelElementCollection", cardinality: "ZeroToMany", description: "Set of properties for this capability",
                  semanticId: "https://admin-shell.io/idta/CapabilityDescription/PropertySet/1/0", children: [] },
                { idShort: "CapabilityRelations", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne", description: "Relations and constraints",
                  semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRelations/1/0", children: [] },
              ]
            },
          ]
        },
      ]
    }

    if (matchUrl('https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation') || matchName("HandoverDocumentation", "Handover Documentation")) {
      return [
        { idShort: "HandoverDocumentation", modelType: "SubmodelElementCollection", cardinality: "One", description: "Handover documentation",
          semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/HandoverDocumentation",
          children: [
            { idShort: "DocumentClassification", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Document classification", semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/DocumentClassification" },
            { idShort: "DocumentVersionId", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Document version", semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/DocumentVersionId" },
          ]
        },
      ]
    }
    
    return [
      { idShort: "Property1", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Custom property" },
    ]
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const hasChildren = (element: SubmodelElement): boolean => {
    // Collections, lists, and entities can have children even if currently empty
    const isContainer = element.modelType === "SubmodelElementCollection" ||
                        element.modelType === "SubmodelElementList" ||
                        element.modelType === "Entity";
    return (element.children !== undefined && element.children.length > 0) || isContainer;
  }

  // Check if element actually has populated children (for count display)
  const hasPopulatedChildren = (element: SubmodelElement): boolean => {
    return element.children !== undefined && element.children.length > 0;
  }

  // PERF: Instant UI update only - does NOT update submodelData (tree won't re-render)
  const updateElementValueLocal = (newValue: string | Record<string, string>) => {
    setSelectedElement(prev => prev ? { ...prev, value: newValue } : null)
  }

  // PERF: Commit value to submodelData - call this on blur (when user finishes editing)
  const commitElementValue = (
    submodelId: string,
    path: string[],
    newValue: string | Record<string, string>
  ) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const updateInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) return elements

        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current) {
            if (rest.length === 0) {
              return { ...el, value: newValue }
            } else if (el.children) {
              return { ...el, children: updateInElements(el.children, rest) }
            }
          }
          return el
        })
      }

      newData[submodelId] = updateInElements(newData[submodelId], path)
      return newData
    })
  }

  // Legacy function for backwards compatibility - updates both local and global state
  const updateElementValue = (
    submodelId: string,
    path: string[],
    newValue: string | Record<string, string>
  ) => {
    setSelectedElement(prev => prev ? { ...prev, value: newValue } : null)
    commitElementValue(submodelId, path, newValue)
  }

  const updateElementMetadata = (
    submodelId: string,
    path: string[],
    field: keyof SubmodelElement,
    newValue: any
  ) => {
    // PERF: Update selectedElement directly for immediate UI feedback
    setSelectedElement(prev => prev ? { ...prev, [field]: newValue } : null)

    setSubmodelData((prev) => {
      const newData = { ...prev }
      const updateInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) return elements

        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current) {
            if (rest.length === 0) {
              return { ...el, [field]: newValue }
            } else if (el.children) {
              return { ...el, children: updateInElements(el.children, rest) }
            }
          }
          return el
        })
      }

      newData[submodelId] = updateInElements(newData[submodelId], path)
      return newData
    })
  }

  const getTypeBadge = (type: string) => {
    const key = (type || "").toString().toLowerCase();

    const badgeMap: Record<string, { label: string; color: string }> = {
      // core
      property: { label: "Prop", color: "#6662b4" },
      multilanguageproperty: { label: "MLP", color: "#ffa500" },
      submodelelementcollection: { label: "SMC", color: "#61caf3" },
      submodelelementlist: { label: "SML", color: "#61caf3" },
      file: { label: "File", color: "#10b981" },
      referenceelement: { label: "REF", color: "#1793b8" },
      range: { label: "RNG", color: "#8b5cf6" },
      operation: { label: "OP", color: "#ef4444" },

      // events
      basiceventelement: { label: "EVT", color: "#0ea5e9" },
      event: { label: "EVT", color: "#0ea5e9" },
      eventelement: { label: "EVT", color: "#0ea5e9" },

      // other common types
      blob: { label: "BLOB", color: "#14b8a6" },
      entity: { label: "ENT", color: "#f59e0b" },
      relationshipelement: { label: "REL", color: "#7c3aed" },
      annotatedrelationshipelement: { label: "AREL", color: "#7c3aed" },
      capability: { label: "CAP", color: "#22c55e" },
    };

    const badge = badgeMap[key] || { label: "Node", color: "#1793b8" };
    return (
      <span
        className="px-2 py-0.5 text-white text-xs font-semibold rounded"
        style={{ backgroundColor: badge.color }}
      >
        {badge.label}
      </span>
    );
  }

  const getCardinalityBadge = (cardinality: string) => {
    const colorMap: Record<string, string> = {
      "One": "bg-red-600",
      "ZeroToOne": "bg-yellow-600",
      "ZeroToMany": "bg-blue-600",
      "OneToMany": "bg-purple-600"
    }
    return (
      <span className={`px-2 py-0.5 ${colorMap[cardinality]} text-white text-xs font-semibold rounded`}>
        {cardinality}
      </span>
    )
  }
  const reorderElements = (submodelId: string, parentPath: string[], fromIndex: number, toIndex: number) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const reorderInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) {
          // Reorder at root level
          const newElements = [...elements]
          const [movedElement] = newElements.splice(fromIndex, 1)
          newElements.splice(toIndex, 0, movedElement)
          return newElements
        }
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current && el.children) {
            return { ...el, children: reorderInElements(el.children, rest) }
          }
          return el
        })
      }
      
      newData[submodelId] = reorderInElements(newData[submodelId], parentPath)
      return newData
    })
  }

  // Move an element from one location to another (including into containers)
  const moveElement = (submodelId: string, sourcePath: string[], targetPath: string[]) => {
    // Prevent moving an element into itself or its descendants
    if (targetPath.join('.').startsWith(sourcePath.join('.'))) {
      toast.error("Cannot move an element into itself or its children");
      return;
    }

    setSubmodelData((prev) => {
      const newData = { ...prev };
      let elementToMove: SubmodelElement | null = null;

      // Step 1: Find and remove the element from its source location
      const removeFromPath = (elements: SubmodelElement[], path: string[]): SubmodelElement[] => {
        if (path.length === 1) {
          const idx = elements.findIndex(el => el.idShort === path[0]);
          if (idx !== -1) {
            elementToMove = { ...elements[idx] };
            return elements.filter((_, i) => i !== idx);
          }
          return elements;
        }
        const [current, ...rest] = path;
        return elements.map(el => {
          if (el.idShort === current && el.children) {
            return { ...el, children: removeFromPath(el.children, rest) };
          }
          return el;
        });
      };

      // Step 2: Add the element to its target location
      const addToPath = (elements: SubmodelElement[], path: string[], element: SubmodelElement): SubmodelElement[] => {
        if (path.length === 0) {
          // Add at root level - check for duplicate
          if (elements.some(el => el.idShort === element.idShort)) {
            toast.error(`An element with idShort "${element.idShort}" already exists at this level`);
            return elements;
          }
          return [...elements, element];
        }
        const [current, ...rest] = path;
        return elements.map(el => {
          if (el.idShort === current) {
            const children = el.children || [];
            if (rest.length === 0) {
              // This is the target container - add element here
              if (children.some(c => c.idShort === element.idShort)) {
                toast.error(`An element with idShort "${element.idShort}" already exists in this container`);
                return el;
              }
              return { ...el, children: [...children, element] };
            }
            return { ...el, children: addToPath(children, rest, element) };
          }
          return el;
        });
      };

      // Remove from source
      newData[submodelId] = removeFromPath(newData[submodelId] || [], sourcePath);

      // Add to target (if element was found)
      if (elementToMove) {
        const moved = elementToMove as SubmodelElement;
        newData[submodelId] = addToPath(newData[submodelId], targetPath, moved);
        toast.success(`Moved "${moved.idShort}" to new location`);
      }

      return newData;
    });

    // Expand the target container
    if (targetPath.length > 0) {
      const nodeId = targetPath.join('.');
      setExpandedNodes(prev => new Set([...prev, nodeId]));
    }
  };

  // Check if an element type can contain children
  const isContainerType = (modelType: SubmodelElementModelType): boolean => {
    return modelType === "SubmodelElementCollection" ||
           modelType === "SubmodelElementList" ||
           modelType === "Entity";
  };

  const renderTreeNode = (
    element: SubmodelElement,
    depth: number,
    path: string[],
    index: number, // Added index for reordering
    siblings: SubmodelElement[], // Added siblings for reordering
    zebraCounter?: { value: number }
  ): React.ReactNode => {
    const rowIndex = zebraCounter ? zebraCounter.value++ : 0
    const isEvenRow = rowIndex % 2 === 0
    const nodeId = path.join('.')
    // Use a unique React key per sibling; keep nodeId for expand/validation logic
    const reactKey = `${nodeId}#${index}`
    const isExpanded = expandedNodes.has(nodeId)
    const isSelected = selectedElementPath.length > 0 &&
                      JSON.stringify(path) === JSON.stringify(selectedElementPath)
    const hasKids = hasChildren(element)
    const isDeletable = canDelete(element.cardinality)
    const hasValidationError = validationErrors.has(nodeId)
    // Drag and drop state for styling
    const isDragging = draggedItem?.path.join('.') === nodeId
    const isDragOver = dragOverItem === nodeId
    const isDropTarget = dragOverContainer === nodeId // For container drop target
    const isContainer = isContainerType(element.modelType)

    const getDisplayValue = (): string => {
      if (element.modelType === "Property") {
        return typeof element.value === 'string' && element.value ? element.value : ''
      } else if (element.modelType === "MultiLanguageProperty") {
        if (typeof element.value === 'object' && element.value !== null) {
          const entries = Object.entries(element.value).filter(([_, text]) => text)
          if (entries.length > 0) {
            return entries.map(([lang, text]) => `${lang}: ${text}`).join(', ')
          }
        }
      }
      return ''
    }

    const displayValue = getDisplayValue()
    const parentPath = path.slice(0, -1) // Get the path to the parent

    return (
      <div key={nodeId} style={{ marginLeft: depth > 0 ? "0px" : "0" }}>
        {/* Added draggable, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop attributes */}
        <div
          draggable={selectedSubmodel !== null}
          onDragStart={(e) => {
            if (!selectedSubmodel) return
            setDraggedItem({ path, element })
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            setDraggedItem(null)
            setDragOverItem(null)
            setDragOverContainer(null)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (!draggedItem) return

            // Don't allow dropping on self
            if (draggedItem.path.join('.') === nodeId) return

            // Check if this is a container and the dragged item is not its ancestor
            if (isContainer && !draggedItem.path.join('.').startsWith(nodeId)) {
              // Can drop INTO this container
              setDragOverContainer(nodeId)
              setDragOverItem(null)
            } else {
              // Only allow reorder if same parent
              const draggedParentPath = draggedItem.path.slice(0, -1).join('.')
              const currentParentPath = parentPath.join('.')

              if (draggedParentPath === currentParentPath) {
                setDragOverItem(nodeId)
                setDragOverContainer(null)
              }
            }
          }}
          onDragLeave={(e) => {
            // Only clear if we're actually leaving the element
            const relatedTarget = e.relatedTarget as HTMLElement
            if (!e.currentTarget.contains(relatedTarget)) {
              setDragOverItem(null)
              setDragOverContainer(null)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!draggedItem || !selectedSubmodel) return

            const draggedPath = draggedItem.path

            // Check if dropping into a container
            if (isContainer && dragOverContainer === nodeId) {
              // Move element into this container
              moveElement(selectedSubmodel.idShort, draggedPath, path)
            } else {
              // Check if same parent for reordering
              const draggedParentPath = draggedPath.slice(0, -1)
              const currentParentPath = parentPath

              if (JSON.stringify(draggedParentPath) === JSON.stringify(currentParentPath)) {
                // Find indices
                const draggedIndex = siblings.findIndex(el => el.idShort === draggedItem.element.idShort)
                const targetIndex = index

                if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
                  reorderElements(selectedSubmodel.idShort, parentPath, draggedIndex, targetIndex)
                }
              }
            }

            setDraggedItem(null)
            setDragOverItem(null)
            setDragOverContainer(null)
          }}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group ${
            isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-[#61caf3]" : isEvenRow ? "bg-gray-50/50 dark:bg-gray-800/30" : ""
          } ${hasValidationError ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/20" : ""}
          ${isDragging ? "opacity-50" : ""}
          ${isDragOver ? "border-t-2 border-[#61caf3]" : ""}
          ${isDropTarget ? "bg-[#61caf3]/20 border-2 border-[#61caf3] border-dashed rounded-lg" : ""}`}
          style={{ paddingLeft: hasKids ? `${depth * 20 + 12}px` : `${depth * 20 + 12}px` }}
          onClick={() => {
            setSelectedElement(element)
            setSelectedElementPath(path)
            if (hasKids) toggleNode(nodeId)
          }}
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          
          <div className="w-4">
            {hasKids && (
              <span onClick={(e) => { e.stopPropagation(); toggleNode(nodeId) }}>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
            )}
          </div>
          {getTypeBadge(element.modelType)}
          <span className={cn(
            "text-sm font-medium flex-1",
            hasValidationError && "text-red-700 dark:text-red-400",
            elementMatchesSearch(element.idShort) && "bg-yellow-200 dark:bg-yellow-900/50 px-1 rounded"
          )}>
            {element.idShort}
            {displayValue && (
              <span className="text-gray-600 dark:text-gray-400 font-normal ml-2">
                = {displayValue}
              </span>
            )}
            {(element.cardinality === "One" || element.cardinality === "OneToMany") && 
             !hasKids && 
             !displayValue && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </span>
          {hasPopulatedChildren(element) && (
            <span className="text-xs text-gray-500">
              ({element.children?.length || 0})
            </span>
          )}
          {/* Add Child button for SMC/SML */}
          {editMode && (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList" || element.modelType === "Entity") && selectedSubmodel && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                openAddElementDialog(path)
              }}
              className="p-1 hover:bg-[#61caf3]/20 rounded text-[#61caf3]/60 hover:text-[#61caf3] transition-colors"
              title="Add child element"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {isDeletable && selectedSubmodel && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteElement(selectedSubmodel.idShort, path)
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete element (optional)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {isExpanded && hasKids && element.children && (
          <div>
            {element.children.map((child, idx) =>
              renderTreeNode(child, depth + 1, [...path, child.idShort], idx, element.children!, zebraCounter)
            )}
            {/* Add child button inside expanded collection */}
            {editMode && (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList" || element.modelType === "Entity") && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openAddElementDialog(path)
                }}
                className="flex items-center gap-2 px-3 py-2 ml-4 mt-1 text-sm text-[#61caf3] hover:bg-[#61caf3]/10 rounded-lg transition-colors"
                style={{ marginLeft: `${(depth + 1) * 20 + 12}px` }}
              >
                <Plus className="w-4 h-4" />
                <span>Add child element</span>
              </button>
            )}
          </div>
        )}
        {/* Show add button when collection is expanded but empty */}
        {isExpanded && editMode && (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList" || element.modelType === "Entity") && (!element.children || element.children.length === 0) && (
          <div style={{ marginLeft: `${(depth + 1) * 20 + 12}px` }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                openAddElementDialog(path)
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#61caf3] hover:bg-[#61caf3]/10 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add first child element</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, submodelId: string, elementPath: string[]) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const fileData = {
        content: reader.result as string,
        mimeType: file.type,
        fileName: file.name
      }
      
      // Update element with file data
      updateElementMetadata(submodelId, elementPath, 'fileData', fileData)
      // Update value with file path
      updateElementValue(submodelId, elementPath, `/files/${file.name}`)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // Stable helper: find the path of a SubmodelElement within a tree
  const buildElementPath = useCallback((
    element: SubmodelElement,
    elements: SubmodelElement[],
    currentPath: string[] = []
  ): string[] | null => {
    for (const el of elements) {
      if (el.idShort === element.idShort) {
        return [...currentPath, el.idShort]
      }
      if (el.children) {
        const found = buildElementPath(element, el.children, [...currentPath, el.idShort])
        if (found) return found
      }
    }
    return null
  }, [])

  const renderEditableDetails = () => {
    if (!selectedElement || !selectedSubmodel) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          Select an element to edit
        </div>
      )
    }

    const isRequired = selectedElement.cardinality === "One" || selectedElement.cardinality === "OneToMany"
    const isMultiple = selectedElement.cardinality === "ZeroToMany" || selectedElement.cardinality === "OneToMany"

    const elementPath = buildElementPath(selectedElement, submodelData[selectedSubmodel.idShort] || []) || [selectedElement.idShort]

    const addLanguageToMLP = (newLang: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return
      
      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? selectedElement.value : { en: '' }
      if (!currentValue[newLang]) {
        const updatedValue = { ...currentValue, [newLang]: '' }
        updateElementValue(selectedSubmodel.idShort, elementPath, updatedValue)
      }
    }

    const removeLanguageFromMLP = (lang: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return
      if (lang === 'en') return // Always keep English
      
      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? { ...selectedElement.value } : { en: '' }
      delete currentValue[lang]
      updateElementValue(selectedSubmodel.idShort, elementPath, currentValue)
    }

    // PERF: Local-only update for instant typing feedback (no tree re-render)
    const updateMLPLanguageValueLocal = (lang: string, text: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return

      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? { ...selectedElement.value } : { en: '' }
      currentValue[lang] = text
      updateElementValueLocal(currentValue)
    }

    // PERF: Commit to global state (call on blur)
    const commitMLPLanguageValue = (lang: string, text: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return

      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? { ...selectedElement.value } : { en: '' }
      currentValue[lang] = text
      commitElementValue(selectedSubmodel.idShort, elementPath, currentValue)
    }

    return (
      <div className="p-4 space-y-6">
        <div className="space-y-3 pb-4 border-b">
          <div className="flex items-center gap-2">
            {getTypeBadge(selectedElement.modelType)}
            {getCardinalityBadge(selectedElement.cardinality)}
          </div>
          <input
            type="text"
            defaultValue={selectedElement.idShort}
            key={selectedElement.idShort}
            onBlur={(e) => {
              const newIdShort = e.target.value.trim()
              if (
                newIdShort &&
                newIdShort !== selectedElement.idShort &&
                /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newIdShort)
              ) {
                updateElementMetadata(selectedSubmodel.idShort, elementPath, 'idShort', newIdShort)
                setSelectedElementPath(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = newIdShort
                  return updated
                })
              } else {
                // Reset to original if invalid
                e.target.value = selectedElement.idShort
              }
            }}
            className="font-semibold text-lg w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-[#61caf3] outline-none"
            title="Click to rename idShort"
          />
        </div>

        <div className="space-y-3 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800/30">
          <h4 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
            Value {isRequired && <span className="text-red-500">*</span>}
          </h4>

          {selectedElement.modelType === "Property" && (
            <div>
              <input
                type="text"
                value={typeof selectedElement.value === 'string' ? selectedElement.value : ''}
                onChange={(e) => {
                  // PERF: Only update local UI state (instant feedback, no tree re-render)
                  updateElementValueLocal(e.target.value)
                }}
                onBlur={(e) => {
                  // PERF: Commit to global state only when done editing (tree re-renders once)
                  commitElementValue(selectedSubmodel.idShort, elementPath, e.target.value)
                }}
                placeholder={`Enter ${selectedElement.idShort}...`}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
              />
            </div>
          )}

          {selectedElement.modelType === "MultiLanguageProperty" && (
            <div className="space-y-3">
              {typeof selectedElement.value === 'object' && selectedElement.value !== null && Object.entries(selectedElement.value as Record<string, string>).map(([lang, text]) => (
                <div key={lang} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Language: {lang === 'en' ? 'English' : lang === 'de' ? 'German' : lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang === 'it' ? 'Italian' : lang} ({lang})
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => updateMLPLanguageValueLocal(lang, e.target.value)}
                      onBlur={(e) => commitMLPLanguageValue(lang, e.target.value)}
                      placeholder={`Enter ${selectedElement.idShort} in ${lang}...`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
                    />
                  </div>
                  {lang !== 'en' && (
                    <button
                      onClick={() => removeLanguageFromMLP(lang)}
                      className="mt-6 p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                      title="Remove language"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Add Language
                </label>
                <div className="flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addLanguageToMLP(e.target.value)
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
            </div>
          )}

          {(selectedElement.modelType === "SubmodelElementCollection" ||
            selectedElement.modelType === "SubmodelElementList") && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1">Collection Element</p>
              <p>This element contains child properties. Select its children in the tree to edit their values.</p>
            </div>
          )}

          {selectedElement.modelType === "Operation" && (
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium">Operation Element</p>
              <p>Operations define callable functions. Add child elements to define input/output/inoutput variables using the tree below.</p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {(["inputVariables", "outputVariables", "inoutputVariables"] as const).map((varKind) => (
                  <div key={varKind} className="text-xs text-center px-2 py-1 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    {varKind === "inputVariables" ? "Input" : varKind === "outputVariables" ? "Output" : "In/Out"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedElement.modelType === "BasicEventElement" && (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium">Basic Event Element</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Observed (semanticId of observed element):
                </label>
                <input
                  type="text"
                  value={typeof (selectedElement as any).observed === 'string' ? (selectedElement as any).observed : ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'observed' as any, e.target.value || undefined)
                  }}
                  placeholder="e.g. SubmodelElement path to observe..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Direction:
                </label>
                <select
                  value={(selectedElement as any).direction || 'output'}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'direction' as any, e.target.value)
                  }}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="output">output</option>
                  <option value="input">input</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  State:
                </label>
                <select
                  value={(selectedElement as any).state || 'on'}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'state' as any, e.target.value)
                  }}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              </div>
            </div>
          )}

          {(selectedElement.modelType === "RelationshipElement" || selectedElement.modelType === "AnnotatedRelationshipElement") && (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium">{selectedElement.modelType === "AnnotatedRelationshipElement" ? "Annotated Relationship Element" : "Relationship Element"}</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  First (reference):
                </label>
                <input
                  type="text"
                  value={(() => {
                    const f = (selectedElement as any).first;
                    if (typeof f === 'string') return f;
                    if (f && typeof f === 'object' && Array.isArray(f.keys) && f.keys.length > 0) {
                      const k = f.keys[0];
                      return typeof k === 'string' ? k : (k?.value || '');
                    }
                    return '';
                  })()}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'first' as any, val ? { type: "ModelReference", keys: [{ type: "Referable", value: val }] } : { type: "ModelReference", keys: [] })
                  }}
                  placeholder="Reference to first element..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Second (reference):
                </label>
                <input
                  type="text"
                  value={(() => {
                    const s = (selectedElement as any).second;
                    if (typeof s === 'string') return s;
                    if (s && typeof s === 'object' && Array.isArray(s.keys) && s.keys.length > 0) {
                      const k = s.keys[0];
                      return typeof k === 'string' ? k : (k?.value || '');
                    }
                    return '';
                  })()}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'second' as any, val ? { type: "ModelReference", keys: [{ type: "Referable", value: val }] } : { type: "ModelReference", keys: [] })
                  }}
                  placeholder="Reference to second element..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-xs font-mono"
                />
              </div>
              {selectedElement.modelType === "AnnotatedRelationshipElement" && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Annotations are child elements — add them via the tree.
                </p>
              )}
            </div>
          )}

          {selectedElement.modelType === "Entity" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Entity Type:
                </label>
                <select
                  value={(selectedElement as any).entityType || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'entityType' as any, e.target.value || undefined)
                  }}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">Select entity type...</option>
                  <option value="CoManagedEntity">CoManagedEntity</option>
                  <option value="SelfManagedEntity">SelfManagedEntity</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Entity is a container element. Select its children in the tree to edit their values.
              </p>
            </div>
          )}

          {/* Constraint editing for ConstraintSet SMC */}
          {selectedElement.modelType === "SubmodelElementCollection" && selectedElement.idShort === "ConstraintSet" && (() => {
            // Find sibling PropertySet to list available target properties
            const parentPath = elementPath.slice(0, -1);
            const findElements = (els: SubmodelElement[], path: string[]): SubmodelElement[] | null => {
              if (path.length === 0) return els;
              const [first, ...rest] = path;
              const found = els.find(e => e.idShort === first);
              if (!found || !found.children) return null;
              return findElements(found.children, rest);
            };
            const siblings = findElements(submodelData[selectedSubmodel.idShort] || [], parentPath);
            const propertySet = siblings?.find(s => s.idShort === 'PropertySet');
            const propertyOptions: string[] = [];
            if (propertySet?.children) {
              for (const container of propertySet.children) {
                // Each PropertyContainer has a child that is the actual property
                if (container.children) {
                  for (const child of container.children) {
                    if (child.idShort) propertyOptions.push(child.idShort);
                  }
                } else if (container.idShort) {
                  propertyOptions.push(container.idShort.replace(/Container$/, ''));
                }
              }
            }
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Constraint Set</p>
                  <button
                    onClick={() => {
                      setShowConstraintForm(!showConstraintForm);
                      setConstraintIdShort("");
                      setConstraintValue("");
                      setConstraintTargetProperty(propertyOptions[0] || "");
                    }}
                    className="text-xs px-2 py-1 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded hover:bg-cyan-100 dark:hover:bg-cyan-900/50 border border-cyan-200 dark:border-cyan-700"
                  >
                    {showConstraintForm ? 'Cancel' : '+ Add Constraint'}
                  </button>
                </div>
                {showConstraintForm && (
                  <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name (idShort):</label>
                      <input type="text" value={constraintIdShort} onChange={(e) => setConstraintIdShort(e.target.value)}
                        placeholder="e.g. MinPowerConstraint" className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Constraint Type:</label>
                      <select value={constraintType} onChange={(e) => setConstraintType(e.target.value as any)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm">
                        <option value="BasicConstraint">BasicConstraint</option>
                        <option value="CustomConstraint">CustomConstraint</option>
                        <option value="OCLConstraint">OCLConstraint</option>
                        <option value="OperationConstraint">OperationConstraint</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expression:</label>
                      <input type="text" value={constraintValue} onChange={(e) => setConstraintValue(e.target.value)}
                        placeholder="e.g. LaserPower >= 1000" className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Conditional Type:</label>
                      <select value={constraintConditionalType} onChange={(e) => setConstraintConditionalType(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm">
                        <option value="Precondition">Precondition</option>
                        <option value="Postcondition">Postcondition</option>
                        <option value="Invariant">Invariant</option>
                      </select>
                    </div>
                    {propertyOptions.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Property:</label>
                        <select value={constraintTargetProperty} onChange={(e) => setConstraintTargetProperty(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm">
                          {propertyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (!constraintIdShort.trim()) { toast.error("Please enter a constraint name"); return; }
                        if (!constraintValue.trim()) { toast.error("Please enter a constraint expression"); return; }
                        const newConstraint = createPropertyConstraintContainer({
                          idShort: constraintIdShort.trim(),
                          constraintType,
                          value: constraintValue.trim(),
                          conditionalType: constraintConditionalType,
                          targetPropertyPath: constraintTargetProperty || "",
                          constraintElementPath: constraintIdShort.trim(),
                        });
                        // Add constraint as child of ConstraintSet
                        setSubmodelData((prev) => {
                          const newData = { ...prev };
                          const addToPath = (els: SubmodelElement[], path: string[]): SubmodelElement[] => {
                            if (path.length === 0) return [...els, newConstraint as any];
                            const [current, ...rest] = path;
                            return els.map(el => {
                              if (el.idShort === current) {
                                if (rest.length === 0) return { ...el, children: [...(el.children || []), newConstraint as any] };
                                return { ...el, children: addToPath(el.children || [], rest) };
                              }
                              return el;
                            });
                          };
                          newData[selectedSubmodel.idShort] = addToPath(newData[selectedSubmodel.idShort] || [], elementPath);
                          return newData;
                        });
                        setShowConstraintForm(false);
                        toast.success(`Added constraint "${constraintIdShort}"`);
                      }}
                      className="w-full px-3 py-1.5 bg-cyan-600 text-white rounded text-sm hover:bg-cyan-700"
                    >
                      Add Constraint
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(selectedElement.children?.length || 0)} constraint(s) defined. Expand in tree to edit individual constraints.
                </p>
              </div>
            );
          })()}

          {selectedElement.modelType === "File" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload a file (image, PDF, document) for this property.
              </p>
              
              <label className="block">
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={(e) => handleFileUpload(e, selectedSubmodel.idShort, elementPath)}
                    className="hidden"
                  />
                  <div className="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#61caf3] cursor-pointer flex flex-col items-center justify-center text-gray-400 hover:text-[#61caf3] bg-white dark:bg-gray-900 transition-all">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm">Click to upload file</span>
                    <span className="text-xs text-gray-500 mt-1">Images, PDFs, documents</span>
                  </div>
                </label>
              
              {selectedElement.fileData && (
                <div className="bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 rounded-lg p-3 space-y-2 border border-cyan-200/50 dark:border-cyan-700/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-cyan-600" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {selectedElement.fileData.fileName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {selectedElement.fileData.mimeType}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        updateElementMetadata(selectedSubmodel.idShort, elementPath, 'fileData', undefined)
                        updateElementValue(selectedSubmodel.idShort, elementPath, '')
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {selectedElement.fileData.mimeType.startsWith('image/') && (
                    <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img
                        src={selectedElement.fileData.content || "/placeholder.svg"}
                        alt={selectedElement.fileData.fileName}
                        className="max-w-full max-h-48 object-contain mx-auto"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Manual path input as fallback */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Or enter file path/URL manually:
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.value === 'string' ? selectedElement.value : ''}
                  onChange={(e) => {
                    // PERF: Only update local UI state (instant feedback)
                    updateElementValueLocal(e.target.value)
                  }}
                  onBlur={(e) => {
                    // PERF: Commit to global state on blur
                    commitElementValue(selectedSubmodel.idShort, elementPath, e.target.value)
                  }}
                  placeholder="/files/manual-path.pdf or https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent text-sm"
                />
              </div>
            </div>
          )}

          {(selectedElement.modelType === "Property") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Value Type:
              </label>
              <select
                value={normalizeValueType(selectedElement.valueType) || ''}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  updateElementMetadata(selectedSubmodel.idShort, elementPath, 'valueType', val);
                }}
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

        {/* Metadata sections below value */}
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">
              Property Metadata
            </h4>
            
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Type:
                </label>
                <div className="font-mono text-gray-900 dark:text-gray-100">
                  {selectedElement.modelType}
                </div>
              </div>
              
              {/* Reordered elements to match XSD: preferredName, shortName, unit, dataType, definition */}
              {/* Preferred Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Preferred Name (English):
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.preferredName === 'string' 
                    ? selectedElement.preferredName 
                    : selectedElement.preferredName?.en || ''}
                  onChange={(e) => {
                    const currentPreferredName = selectedElement.preferredName || {};
                    const newValue = typeof currentPreferredName === 'string'
                      ? { en: e.target.value }
                      : { ...currentPreferredName, en: e.target.value };
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'preferredName', newValue)
                  }}
                  placeholder="Enter preferred name..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              
              {/* Short Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Short Name (English):
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.shortName === 'string' 
                    ? selectedElement.shortName 
                    : selectedElement.shortName?.en || ''}
                  onChange={(e) => {
                    const currentShortName = selectedElement.shortName || {};
                    const newValue = typeof currentShortName === 'string'
                      ? { en: e.target.value }
                      : { ...currentShortName, en: e.target.value };
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'shortName', newValue)
                  }}
                  placeholder="Enter short name..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Unit:
                </label>
                <input
                  type="text"
                  value={selectedElement.unit || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'unit', e.target.value)
                  }}
                  placeholder="mm, kg, °C, etc."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>

              {/* Data Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Data Type:
                </label>
                <select
                  value={selectedElement.dataType || ''}
                  onChange={(e) =>
                    updateElementMetadata(
                      selectedSubmodel.idShort,
                      elementPath,
                      'dataType',
                      e.target.value || undefined
                    )
                  }
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">Select data type...</option>
                  {IEC_DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Definition/Description (moved here for order) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Definition/Description:
                </label>
                <textarea
                  value={selectedElement.description || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'description', e.target.value)
                  }}
                  placeholder="Enter property definition/description..."
                  rows={3}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              
              {/* Category - Changed to dropdown */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Category:
                </label>
                <select
                  value={selectedElement.category || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'category', e.target.value || undefined)
                  }}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">None</option>
                  <option value="CONSTANT">CONSTANT</option>
                  <option value="PARAMETER">PARAMETER</option>
                  <option value="VARIABLE">VARIABLE</option>
                </select>
              </div>
              
              {/* Cardinality */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Cardinality:
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-900 dark:text-gray-100">
                    {selectedElement.cardinality}
                  </span>
                  <span className="text-xs text-gray-500">
                    {isRequired ? "(Required)" : "(Optional)"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase mb-2">
              Semantic ID (ECLASS/IEC61360)
            </h4>
            <EClassPicker
              value={typeof selectedElement.semanticId === 'string' ? selectedElement.semanticId : ''}
              onChange={(irdi, prop) => {
                updateElementMetadata(selectedSubmodel.idShort, elementPath, 'semanticId', irdi)
                // Auto-fill valueType and unit from eCLASS property when available
                if (prop) {
                  if (prop.xsdType && selectedElement.modelType === 'Property') {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'valueType', prop.xsdType)
                  }
                  if (prop.unit) {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'unit', prop.unit)
                  }
                }
              }}
              placeholder="0173-1#02-AAO677#002 or https://..."
            />
            {typeof selectedElement.semanticId === 'string' && selectedElement.semanticId.startsWith('http') && (
              <a
                href={selectedElement.semanticId}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline mt-1 block"
              >
                View specification →
              </a>
            )}
          </div>
          
          {/* Removed Source of Definition input */}
        </div>
      </div>
    )
  }

  // New type to store collected concept descriptions
  type ConceptDescription = {
    id: string;
    idShort: string;
    preferredName?: Record<string, string>;
    shortName?: Record<string, string>;
    description?: string;
    dataType?: string;
    unit?: string;
    category?: string;
    valueType?: string; // For properties
  };

  // Helper to build current XML (same structure as in export) for validation
  const buildCurrentXml = (): string => {
    const collectedConceptDescriptions: Record<string, ConceptDescription> = {};

    // Collect all unique concept descriptions from elements with semanticId
    const collectConcepts = (elements: SubmodelElement[]) => {
      elements.forEach(element => {
        // Extract semanticId value - handle both string and object formats
        let conceptId = "";
        if (typeof element.semanticId === "string") {
          conceptId = element.semanticId.trim();
        } else if (element.semanticId && typeof element.semanticId === "object") {
          const semObj = element.semanticId as any;
          if (Array.isArray(semObj.keys) && semObj.keys.length > 0) {
            const key = semObj.keys[0];
            conceptId = typeof key === "string" ? key : (key?.value || "");
          } else if (Array.isArray(semObj.key) && semObj.key.length > 0) {
            const key = semObj.key[0];
            conceptId = typeof key === "string" ? key : (key?.value || "");
          } else if (semObj.value) {
            conceptId = String(semObj.value);
          }
        }
        conceptId = conceptId.trim();

        if (conceptId && !collectedConceptDescriptions[conceptId]) {
          collectedConceptDescriptions[conceptId] = {
            id: conceptId,
            idShort: element.idShort,
            preferredName: typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName,
            shortName: typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName,
            description: element.description,
            dataType: element.dataType,
            unit: element.unit,
            category: element.category,
            valueType: element.valueType,
          };
        }
        if (element.children) {
          collectConcepts(element.children);
        }
      });
    };

    // Collect concepts from all submodels
    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || [];
      collectConcepts(elements);
    });

    // ... existing helper defs ...

    // NEW helpers for asset information normalization and derivation
    const normalizeAssetKind = (ak?: string) => {
      const v = String(ak || "").trim();
      return ["Instance", "Type", "Role", "NotApplicable"].includes(v) ? v : "Instance";
    };
    const findPropertyValue = (ids: string[]): string | undefined => {
      const wanted = new Set(ids.map((s) => s.toLowerCase()));
      for (const sm of aasConfig.selectedSubmodels) {
        const els = submodelData[sm.idShort] || [];
        const walk = (list: SubmodelElement[]): string | undefined => {
          for (const el of list) {
            if (el.modelType === "Property" && wanted.has(String(el.idShort || "").toLowerCase())) {
              const val = typeof el.value === "string" ? el.value.trim() : "";
              if (val) return val;
            }
            if (Array.isArray(el.children) && el.children.length) {
              const got = walk(el.children);
              if (got) return got;
            }
          }
          return undefined;
        };
        const r = walk(els);
        if (r) return r;
      }
      return undefined;
    };
    const deriveGlobalAssetIdValue = (): string => {
      const cfg = String(aasConfig.globalAssetId || "").trim();
      if (cfg) return cfg;
      const fromAssetId = findPropertyValue(["AssetId", "AssetID"]);
      if (fromAssetId) return fromAssetId;
      return "urn:placeholder";
    };
    const deriveManufacturerPartId = (): string | undefined => {
      return (
        findPropertyValue(["MAN_PROD_NUM", "ManufacturerPartNumber"]) ||
        undefined
      );
    };

    // ... existing code that collects concepts ...

    let defaultThumbnailXml = '';
    if (thumbnail) {
      // ... existing thumbnail code ...
    }

    // NEW: prebuild assetInformation fragments
    const assetKindXmlVal = normalizeAssetKind(aasConfig.assetKind);
    const gaiVal = deriveGlobalAssetIdValue();
    // AAS 3.1: globalAssetId is a simple string, not a reference with keys attribute
    const globalAssetIdXml = `        <globalAssetId>${escapeXml(gaiVal)}</globalAssetId>
`;
    const mpn = deriveManufacturerPartId();
    const specificAssetIdsXml = mpn
      ? `        <specificAssetIds>
          <specificAssetId>
            <name>manufacturerPartId</name>
            <value>${escapeXml(mpn)}</value>
          </specificAssetId>
        </specificAssetIds>
`
      : "";

    // Map known template names to their official IDTA semantic IDs
    const IDTA_SEMANTIC_IDS: Record<string, string> = {
      'CapabilityDescription': 'https://admin-shell.io/idta/CapabilityDescription/1/0/Submodel',
      'Digital Nameplate': 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
      'Nameplate': 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
      'TechnicalData': 'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2',
      'CarbonFootprint': 'https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/0/9',
      'HandoverDocumentation': 'https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation',
    }

    const submodelsXml = aasConfig.selectedSubmodels.map(sm => {
      const elements = submodelData[sm.idShort] || [];
      const smIdShortSan = sanitizeIdShortJson(sm.idShort);
      // Resolve semantic ID: prefer IDTA standard IDs, fall back to template URL
      const semanticIdValue = IDTA_SEMANTIC_IDS[sm.template.name]
        || sm.template.url
        || ('https://admin-shell.io/submodels/' + smIdShortSan);
      // AAS 3.1: key elements must have type and value as child elements, not attributes
      return `    <submodel>
      <idShort>${escapeXml(smIdShortSan)}</idShort>
      <id>${escapeXml(`${aasConfig.id}/submodels/${smIdShortSan}`)}</id>
      <kind>Instance</kind>
      <semanticId>
        <type>ExternalReference</type>
        <keys>
          <key>
            <type>GlobalReference</type>
            <value>${escapeXml(semanticIdValue)}</value>
          </key>
        </keys>
      </semanticId>
      <submodelElements>
${elements.map(el => generateElementXml(el, "        ")).join('')}      </submodelElements>
    </submodel>`;
    }).join('\n');

    const conceptXml = Object.values(collectedConceptDescriptions).map(concept => {
      const indent = "    ";
      const cdIdShortSan = sanitizeIdShortJson(concept.idShort);
      const ensuredPreferredName = (concept.preferredName && Object.values(concept.preferredName).some(v => v && String(v).trim() !== ""))
        ? concept.preferredName!
        : { en: cdIdShortSan };

      const preferredXml = Object.entries(ensuredPreferredName).map(([lang, text]) => {
        if (!text || String(text).trim() === "") return "";
        return `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>`;
      }).filter(Boolean).join("\n");

      const shortNameXml = concept.shortName
        ? Object.entries(concept.shortName).map(([lang, text]) => {
            if (!text || String(text).trim() === "") return "";
            return `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>`;
          }).filter(Boolean).join("\n")
        : "";

      const unitXml = concept.unit ? `${indent}          <unit>${escapeXml(concept.unit)}</unit>` : "";
      const dataTypeXml = concept.dataType ? `${indent}          <dataType>${escapeXml(concept.dataType)}</dataType>` : "";
      const definitionXml = concept.description
        ? `${indent}          <definition>
${indent}            <langStringDefinitionTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(concept.description)}</text>
${indent}            </langStringDefinitionTypeIec61360>
${indent}          </definition>`
        : "";

      // AAS 3.1: ConceptDescription uses embeddedDataSpecifications (not dataSpecifications)
      return `${indent}<conceptDescription>
${indent}  <idShort>${escapeXml(cdIdShortSan)}</idShort>
${indent}  <id>${escapeXml(concept.id)}</id>
${indent}  <embeddedDataSpecifications>
${indent}    <embeddedDataSpecification>
${indent}      <dataSpecification>
${indent}        <type>ExternalReference</type>
${indent}        <keys>
${indent}          <key>
${indent}            <type>GlobalReference</type>
${indent}            <value>https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360</value>
${indent}          </key>
${indent}        </keys>
${indent}      </dataSpecification>
${indent}      <dataSpecificationContent>
${indent}        <dataSpecificationIec61360>
${indent}          <preferredName>
${preferredXml}
${indent}          </preferredName>
${shortNameXml ? `${indent}          <shortName>\n${shortNameXml}\n${indent}          </shortName>` : ""}
${unitXml ? unitXml + "\n" : ""}${dataTypeXml ? dataTypeXml + "\n" : ""}${definitionXml ? definitionXml + "\n" : ""}${indent}        </dataSpecificationIec61360>
${indent}      </dataSpecificationContent>
${indent}    </embeddedDataSpecification>
${indent}  </embeddedDataSpecifications>
${indent}</conceptDescription>`;
    }).join('\n');

    // Build shell XML for each AAS shell (multi-AAS support)
    const shells = aasConfig.shells && aasConfig.shells.length > 0
      ? aasConfig.shells
      : [{ idShort: aasConfig.idShort, id: aasConfig.id, assetKind: aasConfig.assetKind, globalAssetId: aasConfig.globalAssetId, submodelIds: aasConfig.selectedSubmodels.map(sm => `${aasConfig.id}/submodels/${sanitizeIdShortJson(sm.idShort)}`) }];

    const shellsXml = shells.map(shell => {
      // Find submodels belonging to this shell
      const shellSubmodelRefs = aasConfig.selectedSubmodels
        .filter(sm => {
          const smId = sm.submodelId || `${aasConfig.id}/submodels/${sanitizeIdShortJson(sm.idShort)}`;
          return shell.submodelIds.length === 0 || shell.submodelIds.includes(smId);
        })
        .map(sm => {
          const smIdShortSan = sanitizeIdShortJson(sm.idShort);
          const smId = sm.submodelId || `${aasConfig.id}/submodels/${smIdShortSan}`;
          return `        <reference>
          <type>ModelReference</type>
          <keys>
            <key>
              <type>Submodel</type>
              <value>${escapeXml(smId)}</value>
            </key>
          </keys>
        </reference>`;
        }).join('\n');

      const shellAssetKind = normalizeAssetKind(shell.assetKind);
      const shellGlobalAssetId = shell.globalAssetId || shell.idShort || "urn:placeholder";

      return `    <assetAdministrationShell>
      <idShort>${escapeXml(shell.idShort)}</idShort>
      <id>${escapeXml(shell.id)}</id>
      <assetInformation>
        <assetKind>${shellAssetKind}</assetKind>
        <globalAssetId>${escapeXml(shellGlobalAssetId)}</globalAssetId>
      </assetInformation>
      <submodels>
${shellSubmodelRefs}
      </submodels>
    </assetAdministrationShell>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<environment xmlns="https://admin-shell.io/aas/3/1" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <assetAdministrationShells>
${shellsXml}
  </assetAdministrationShells>
  <submodels>
${submodelsXml}
  </submodels>
${conceptXml && conceptXml.trim().length > 0 ? `  <conceptDescriptions>
${conceptXml}
  </conceptDescriptions>
` : ""}</environment>`;
    return xml;
  };

  const saveAAS = async () => {
    const env = buildJsonEnvironment();
    const result: ValidationResult = {
      file: `${aasConfig.idShort}.aasx`,
      type: "AASX",
      valid: true,
      processingTime: 0,
      parsed: env,
      aasData: null,
      thumbnail: thumbnail || undefined,
    };
    if (onSave) {
      onSave(result);
      toast.success("Changes saved.");
    }
  };

  // ADD: buildJsonEnvironment helper (JSON structure mirrors export)
  // UPDATED: sanitize idShorts when creating JSON, so export always passes validation
  function buildJsonEnvironment() {
    const prefixXs = (type?: string) => {
      if (!type) return undefined;
      const t = type.trim();
      const common = [
        'string','integer','boolean','float','double','date','dateTime','time',
        'anyURI','base64Binary','hexBinary','decimal','byte','short','int','long',
        'unsignedByte','unsignedShort','unsignedInt','unsignedLong','duration',
        'gDay','gMonth','gMonthDay','gYear','gYearMonth'
      ];
      return common.includes(t) && !t.startsWith('xs:') ? `xs:${t}` : t;
    };

    const mapElementToJson = (element: any): any => {
      const base: any = {
        idShort: sanitizeIdShortJson(element.idShort),
        modelType: element.modelType,
      };

      if (element.category) base.category = element.category;

      if (element.description) {
        const descText = typeof element.description === 'string' ? element.description : String(element.description);
        base.description = [{ language: 'en', text: descText }];
      }

      // Skip semanticId for ReferenceElement (not allowed per AAS 3.1 schema)
      if (element.semanticId && element.modelType !== "ReferenceElement") {
        base.semanticId = {
          type: "ExternalReference",
          keys: [{ type: "GlobalReference", value: element.semanticId }]
        };
      }

      if (element.preferredName) {
        base.preferredName = typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName;
      }
      if (element.shortName) {
        base.shortName = typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName;
      }
      if (element.unit) {
        base.unit = element.unit;
      }
      if (element.dataType) {
        base.dataType = element.dataType;
      }
      if (element.cardinality) {
        base.cardinality = element.cardinality;
      }

      switch ((element.modelType || '').toString()) {
        case "Property":
          return {
            ...base,
            valueType: prefixXs(element.valueType || "string"),
            value: typeof element.value === 'string' ? element.value : undefined,
          };
        case "MultiLanguageProperty": {
          let valueArr: any[] = [];
          if (element.value && typeof element.value === 'object') {
            valueArr = Object.entries(element.value as Record<string, string>)
              .filter(([_, text]) => text && String(text).trim() !== '')
              .map(([language, text]) => ({ language, text }));
          }
          return { ...base, value: valueArr };
        }
        case "File":
          return {
            ...base,
            value: typeof element.value === 'string' ? element.value : '',
            contentType: element.fileData?.mimeType || 'application/octet-stream',
          };
        case "SubmodelElementCollection":
        case "SubmodelElementList":
          return {
            ...base,
            value: Array.isArray(element.children) ? element.children.map(mapElementToJson) : [],
          };
        case "ReferenceElement": {
          // ReferenceElement value should be a proper Reference object
          const refValue = element.value;
          let valueRef: any;
          if (refValue && typeof refValue === 'object' && Array.isArray(refValue.keys) && refValue.keys.length > 0) {
            // Normalize keys - handle both string keys and object keys
            const normalizedKeys = refValue.keys.map((k: any) => {
              if (typeof k === 'string') {
                return { type: "GlobalReference", value: k };
              } else if (typeof k === 'object' && k !== null) {
                return { type: k.type || "GlobalReference", value: k.value || "" };
              }
              return { type: "GlobalReference", value: "" };
            });
            valueRef = {
              type: refValue.type || "ExternalReference",
              keys: normalizedKeys
            };
          } else {
            const fallbackVal = (typeof refValue === 'string' ? refValue.trim() : '') || (element.semanticId || '').trim();
            if (fallbackVal) {
              valueRef = {
                type: "ExternalReference",
                keys: [{ type: "GlobalReference", value: fallbackVal }]
              };
            }
          }
          return {
            ...base,
            value: valueRef
          };
        }
        case "RelationshipElement":
        case "AnnotatedRelationshipElement": {
          const normalizeRef = (ref: any) => {
            if (!ref || typeof ref !== 'object') return { type: "ModelReference", keys: [] };
            return {
              type: ref.type || "ModelReference",
              keys: Array.isArray(ref.keys) ? ref.keys.map((k: any) => ({
                type: (typeof k === 'object' && k !== null) ? (k.type || "Referable") : "Referable",
                value: (typeof k === 'object' && k !== null) ? (k.value || "") : (typeof k === 'string' ? k : ""),
              })) : [],
            };
          };
          const result: any = {
            ...base,
            first: normalizeRef(element.first),
            second: normalizeRef(element.second),
          };
          if (element.modelType === "AnnotatedRelationshipElement" && Array.isArray(element.children) && element.children.length > 0) {
            result.annotations = element.children.map(mapElementToJson);
          }
          return result;
        }
        case "Range": {
          const rangeVal = element.value as any;
          return {
            ...base,
            valueType: prefixXs(element.valueType || "string"),
            min: rangeVal?.min ?? "",
            max: rangeVal?.max ?? "",
          };
        }
        case "Entity": {
          const entityResult: any = {
            ...base,
            entityType: (element as any).entityType || "CoManagedEntity",
          };
          if (Array.isArray(element.children) && element.children.length > 0) {
            entityResult.statements = element.children.map(mapElementToJson);
          }
          return entityResult;
        }
        case "Capability":
          // Qualifiers are already on base if present
          if (Array.isArray(element.qualifiers) && element.qualifiers.length > 0) {
            base.qualifiers = element.qualifiers.map((q: any) => ({
              type: q.type,
              valueType: q.valueType,
              value: q.value,
              ...(q.semanticId ? { semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: q.semanticId }] } } : {}),
            }));
          }
          return base;
        default:
          return base;
      }
    };

    const jsonSubmodels = aasConfig.selectedSubmodels.map(sm => {
      const elements = submodelData[sm.idShort] || [];
      const smIdShortSan = sanitizeIdShortJson(sm.idShort);
      return {
        idShort: smIdShortSan,
        id: `${aasConfig.id}/submodels/${smIdShortSan}`,
        kind: "Instance",
        semanticId: {
          type: "ExternalReference",
          keys: [{
            type: "GlobalReference",
            value: sm.template.url || `https://admin-shell.io/submodels/${smIdShortSan}`
          }]
        },
        submodelElements: elements.map(mapElementToJson),
      };
    });

    // Build shells array (multi-AAS support)
    const shells = aasConfig.shells && aasConfig.shells.length > 0
      ? aasConfig.shells
      : [{ idShort: aasConfig.idShort, id: aasConfig.id, assetKind: aasConfig.assetKind, globalAssetId: aasConfig.globalAssetId, submodelIds: jsonSubmodels.map(sm => sm.id) }];

    const jsonShells = shells.map(shell => {
      const shellSubmodelRefs = jsonSubmodels
        .filter(sm => {
          const smId = sm.id;
          return shell.submodelIds.length === 0 || shell.submodelIds.includes(smId);
        })
        .map(sm => ({
          type: "ModelReference",
          keys: [{ type: "Submodel", value: sm.id }]
        }));

      return {
        id: shell.id,
        idShort: sanitizeIdShortJson(shell.idShort || ""),
        assetInformation: {
          assetKind: shell.assetKind || "Instance",
          globalAssetId: shell.globalAssetId || shell.idShort || "urn:placeholder",
        },
        submodels: shellSubmodelRefs,
      };
    });

    const collectedConcepts: Record<string, any> = {};
    const collect = (els: any[]) => {
      els.forEach(el => {
        if (el.semanticId) {
          const id = el.semanticId;
          if (!collectedConcepts[id]) {
            const preferredName = typeof el.preferredName === 'string' ? { en: el.preferredName } : el.preferredName;
            const shortName = typeof el.shortName === 'string' ? { en: el.shortName } : el.shortName;
            const definitionArr = el.description ? [{ language: "en", text: typeof el.description === 'string' ? el.description : String(el.description) }] : undefined;
            collectedConcepts[id] = {
              id,
              idShort: sanitizeIdShortJson(el.idShort),
              embeddedDataSpecifications: [
                {
                  dataSpecification: {
                    type: "ExternalReference",
                    keys: [
                      { type: "GlobalReference", value: "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360" }
                    ]
                  },
                  dataSpecificationContent: {
                    dataSpecificationIec61360: {
                      preferredName: preferredName ? Object.entries(preferredName).map(([language, text]) => ({ language, text })) : [{ language: "en", text: sanitizeIdShortJson(el.idShort) }],
                      ...(shortName ? { shortName: Object.entries(shortName).map(([language, text]) => ({ language, text })) } : {}),
                      ...(el.unit ? { unit: el.unit } : {}),
                      ...(el.dataType ? { dataType: el.dataType } : {}),
                      ...(definitionArr ? { definition: definitionArr } : {}),
                    }
                  }
                }
              ]
            };
          }
        }
        if (Array.isArray(el.children) && el.children.length) collect(el.children);
      });
    };

    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || [];
      collect(elements);
    });

    return {
      assetAdministrationShells: jsonShells,
      submodels: jsonSubmodels,
      conceptDescriptions: Object.values(collectedConcepts),
    };
  }

  // Generate XML for a SubmodelElement (AAS 3.1)
  // Element order per schema: category, idShort, description, semanticId, embeddedDataSpecifications, [type-specific content]
  function generateElementXml(element: SubmodelElement, indent: string = "      "): string {
    const typeKey = String(element.modelType || "Property").toLowerCase();
    const tagName =
      typeKey === "property" ? "property" :
      typeKey === "multilanguageproperty" ? "multiLanguageProperty" :
      typeKey === "submodelelementcollection" ? "submodelElementCollection" :
      typeKey === "submodelelementlist" ? "submodelElementList" :
      typeKey === "file" ? "file" :
      typeKey === "referenceelement" ? "referenceElement" :
      typeKey === "capability" ? "capability" :
      typeKey === "relationshipelement" ? "relationshipElement" :
      typeKey === "annotatedrelationshipelement" ? "annotatedRelationshipElement" :
      typeKey === "range" ? "range" :
      typeKey === "entity" ? "entity" :
      typeKey === "operation" ? "operation" :
      typeKey === "basiceventelement" ? "basicEventElement" :
      typeKey === "blob" ? "blob" :
      "property";

    const isReference = tagName === "referenceElement";
    const isCollection = tagName === "submodelElementCollection" || tagName === "submodelElementList";

    let xml = `${indent}<${tagName}>\n`;

    // Optional category
    if (element.category && String(element.category).trim() !== "") {
      xml += `${indent}  <category>${escapeXml(element.category)}</category>\n`;
    }

    const elIdShortSan = sanitizeIdShortJson(element.idShort);
    xml += `${indent}  <idShort>${escapeXml(elIdShortSan)}</idShort>\n`;

    // Optional description (langStringTextType) when non-empty
    if (element.description && String(element.description).trim() !== "") {
      const desc = typeof element.description === "string" ? element.description : String(element.description);
      xml += `${indent}  <description>\n`;
      xml += `${indent}    <langStringTextType>\n`;
      xml += `${indent}      <language>en</language>\n`;
      xml += `${indent}      <text>${escapeXml(desc)}</text>\n`;
      xml += `${indent}    </langStringTextType>\n`;
      xml += `${indent}  </description>\n`;
    }

    // semanticId (skip for ReferenceElement) - MUST come before type-specific content per AAS 3.1 schema
    if (element.semanticId && !isReference) {
      // Extract semanticId value - handle both string and object formats
      let sem = "";
      if (typeof element.semanticId === "string") {
        sem = element.semanticId.trim();
      } else if (typeof element.semanticId === "object" && element.semanticId !== null) {
        const semObj = element.semanticId as any;
        // Handle Reference structure: { type, keys: [{ type, value }] }
        if (Array.isArray(semObj.keys) && semObj.keys.length > 0) {
          const key = semObj.keys[0];
          if (typeof key === "string") {
            sem = key.trim();
          } else if (typeof key === "object" && key !== null && key.value) {
            sem = String(key.value).trim();
          }
        }
        // Try singular 'key' property (some templates use this)
        else if (Array.isArray(semObj.key) && semObj.key.length > 0) {
          const key = semObj.key[0];
          if (typeof key === "string") {
            sem = key.trim();
          } else if (typeof key === "object" && key !== null && key.value) {
            sem = String(key.value).trim();
          }
        }
        // Try direct value property (legacy format)
        else if (semObj.value && typeof semObj.value === "string") {
          sem = semObj.value.trim();
        }
        // Try id property (some formats use this)
        else if (semObj.id && typeof semObj.id === "string") {
          sem = semObj.id.trim();
        }
      }
      if (sem && sem !== "[object Object]") {
        xml += `${indent}  <semanticId>\n`;
        xml += `${indent}    <type>ExternalReference</type>\n`;
        xml += `${indent}    <keys>\n`;
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value>${escapeXml(sem)}</value>\n`;
        xml += `${indent}      </key>\n`;
        xml += `${indent}    </keys>\n`;
        xml += `${indent}  </semanticId>\n`;
      }
    }

    // Qualifiers (e.g. CapabilityRoleQualifiers) - MUST come after semanticId per AAS 3.1 schema
    if (Array.isArray(element.qualifiers) && element.qualifiers.length > 0) {
      xml += `${indent}  <qualifiers>\n`;
      for (const q of element.qualifiers) {
        xml += `${indent}    <qualifier>\n`;
        if (q.semanticId) {
          xml += `${indent}      <semanticId>\n`;
          xml += `${indent}        <type>ExternalReference</type>\n`;
          xml += `${indent}        <keys>\n`;
          xml += `${indent}          <key>\n`;
          xml += `${indent}            <type>GlobalReference</type>\n`;
          xml += `${indent}            <value>${escapeXml(q.semanticId)}</value>\n`;
          xml += `${indent}          </key>\n`;
          xml += `${indent}        </keys>\n`;
          xml += `${indent}      </semanticId>\n`;
        }
        xml += `${indent}      <type>${escapeXml(q.type)}</type>\n`;
        xml += `${indent}      <valueType>${escapeXml(q.valueType)}</valueType>\n`;
        xml += `${indent}      <value>${escapeXml(q.value)}</value>\n`;
        xml += `${indent}    </qualifier>\n`;
      }
      xml += `${indent}  </qualifiers>\n`;
    }

    // embeddedDataSpecifications (IEC 61360) - MUST come before type-specific content per AAS 3.1 schema
    // Only for Property and MultiLanguageProperty (not for ReferenceElement, File, or Collections)
    if (!isReference && !isCollection && tagName !== "file") {
      const hasPref = (() => {
        if (!element.preferredName) return false;
        if (typeof element.preferredName === "string") return element.preferredName.trim() !== "";
        return Object.values(element.preferredName).some((t) => t && String(t).trim() !== "");
      })();
      const hasShort = (() => {
        if (!element.shortName) return false;
        if (typeof element.shortName === "string") return element.shortName.trim() !== "";
        return Object.values(element.shortName).some((t) => t && String(t).trim() !== "");
      })();
      const hasUnit = !!(element.unit && element.unit.trim() !== "");
      const hasDt = !!(element.dataType && element.dataType.trim() !== "");

      if (hasPref || hasShort || hasUnit || hasDt) {
        const prefObj = typeof element.preferredName === "string" ? { en: element.preferredName } : (element.preferredName || {});
        const shortObj = typeof element.shortName === "string" ? { en: element.shortName } : (element.shortName || {});

        // preferredName entries (fallback to idShort if none)
        const preferredNameEntries = Object.entries(prefObj as Record<string, string>)
          .filter(([, t]) => t && String(t).trim() !== "");
        const preferredXml = preferredNameEntries.length > 0
          ? preferredNameEntries.map(([lang, text]) =>
              `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>\n`
            ).join("")
          : `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(elIdShortSan)}</text>
${indent}            </langStringPreferredNameTypeIec61360>\n`;

        const shortNameEntries = Object.entries(shortObj as Record<string, string>)
          .filter(([, t]) => t && String(t).trim() !== "");
        const shortXml = shortNameEntries.map(([lang, text]) =>
          `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>\n`
        ).join("");

        xml += `${indent}  <embeddedDataSpecifications>\n`;
        xml += `${indent}    <embeddedDataSpecification>\n`;
        xml += `${indent}      <dataSpecification>\n`;
        xml += `${indent}        <type>ExternalReference</type>\n`;
        xml += `${indent}        <keys>\n`;
        xml += `${indent}          <key>\n`;
        xml += `${indent}            <type>GlobalReference</type>\n`;
        xml += `${indent}            <value>https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360</value>\n`;
        xml += `${indent}          </key>\n`;
        xml += `${indent}        </keys>\n`;
        xml += `${indent}      </dataSpecification>\n`;
        xml += `${indent}      <dataSpecificationContent>\n`;
        xml += `${indent}        <dataSpecificationIec61360>\n`;
        xml += `${indent}          <preferredName>\n`;
        xml += preferredXml;
        xml += `${indent}          </preferredName>\n`;
        if (shortXml) {
          xml += `${indent}          <shortName>\n`;
          xml += shortXml;
          xml += `${indent}          </shortName>\n`;
        }
        if (hasUnit) {
          xml += `${indent}          <unit>${escapeXml(element.unit!)}</unit>\n`;
        }
        if (hasDt) {
          xml += `${indent}          <dataType>${escapeXml(element.dataType!)}</dataType>\n`;
        }
        xml += `${indent}        </dataSpecificationIec61360>\n`;
        xml += `${indent}      </dataSpecificationContent>\n`;
        xml += `${indent}    </embeddedDataSpecification>\n`;
        xml += `${indent}  </embeddedDataSpecifications>\n`;
      }
    }

    // Type-specific content (MUST come after semanticId and embeddedDataSpecifications per AAS 3.1 schema)
    if (tagName === "property") {
      const vt = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType) || "xs:string";
      xml += `${indent}  <valueType>${escapeXml(vt)}</valueType>\n`;
      const valStr = typeof element.value === "string" ? element.value.trim() : "";
      if (valStr) {
        xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
      } else {
        xml += `${indent}  <value/>\n`;
      }
    } else if (tagName === "multiLanguageProperty") {
      const entries = (element.value && typeof element.value === "object")
        ? Object.entries(element.value as Record<string, string>).filter(([, t]) => t && String(t).trim() !== "")
        : [];
      // Only output value if there are actual entries; empty value element is invalid per schema
      if (entries.length > 0) {
        xml += `${indent}  <value>\n`;
        for (const [lang, text] of entries) {
          xml += `${indent}    <langStringTextType>\n`;
          xml += `${indent}      <language>${escapeXml(lang)}</language>\n`;
          xml += `${indent}      <text>${escapeXml(text)}</text>\n`;
          xml += `${indent}    </langStringTextType>\n`;
        }
        xml += `${indent}  </value>\n`;
      }
      // Do NOT output <value/> for MultiLanguageProperty - schema requires langStringTextType children
    } else if (tagName === "file") {
      const contentType = (element.fileData?.mimeType || "application/octet-stream").trim();
      xml += `${indent}  <contentType>${escapeXml(contentType)}</contentType>\n`;
      const valStr = typeof element.value === "string" ? element.value.trim() : "";
      if (valStr) {
        xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
      }
      // Do NOT output <value/> for File - value is optional
    } else if (tagName === "submodelElementCollection" || tagName === "submodelElementList") {
      const kids = Array.isArray(element.children) ? element.children : [];
      if (kids.length > 0) {
        xml += `${indent}  <value>\n`;
        for (const child of kids) {
          xml += generateElementXml(child, indent + "    ");
        }
        xml += `${indent}  </value>\n`;
      }
    } else if (tagName === "capability") {
      // Capability has no type-specific content (qualifiers already serialized above)
    } else if (tagName === "referenceElement") {
      // ReferenceElement: only value is allowed (no semanticId, no embeddedDataSpecifications)
      const v: any = element.value;
      const hasKeys = v && typeof v === "object" && Array.isArray(v.keys) && v.keys.length > 0;
      const fallback = (typeof v === "string" ? v.trim() : "") || (typeof element.semanticId === "string" ? element.semanticId.trim() : "");
      xml += `${indent}  <value>\n`;
      xml += `${indent}    <type>ExternalReference</type>\n`;
      xml += `${indent}    <keys>\n`;
      if (hasKeys) {
        for (const k of v.keys as any[]) {
          // Handle keys that might be strings or objects
          const keyType = (typeof k === "object" && k !== null) ? (k.type || "GlobalReference") : "GlobalReference";
          const keyValue = (typeof k === "object" && k !== null) ? (k.value || "") : (typeof k === "string" ? k : "");
          xml += `${indent}      <key>\n`;
          xml += `${indent}        <type>${escapeXml(keyType)}</type>\n`;
          xml += `${indent}        <value>${escapeXml(keyValue)}</value>\n`;
          xml += `${indent}      </key>\n`;
        }
      } else if (fallback) {
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value>${escapeXml(fallback)}</value>\n`;
        xml += `${indent}      </key>\n`;
      } else {
        // No keys and no fallback - provide empty placeholder key to satisfy schema
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value></value>\n`;
        xml += `${indent}      </key>\n`;
      }
      xml += `${indent}    </keys>\n`;
      xml += `${indent}  </value>\n`;
    } else if (tagName === "relationshipElement" || tagName === "annotatedRelationshipElement") {
      // Serialize first and second references
      const serializeRef = (ref: any, label: string): string => {
        let refXml = `${indent}  <${label}>\n`;
        if (ref && typeof ref === 'object' && Array.isArray(ref.keys) && ref.keys.length > 0) {
          refXml += `${indent}    <type>${escapeXml(ref.type || "ModelReference")}</type>\n`;
          refXml += `${indent}    <keys>\n`;
          for (const k of ref.keys) {
            const kType = (typeof k === 'object' && k !== null) ? (k.type || "Referable") : "Referable";
            const kValue = (typeof k === 'object' && k !== null) ? (k.value || "") : (typeof k === 'string' ? k : "");
            refXml += `${indent}      <key>\n`;
            refXml += `${indent}        <type>${escapeXml(kType)}</type>\n`;
            refXml += `${indent}        <value>${escapeXml(kValue)}</value>\n`;
            refXml += `${indent}      </key>\n`;
          }
          refXml += `${indent}    </keys>\n`;
        } else {
          refXml += `${indent}    <type>ModelReference</type>\n`;
          refXml += `${indent}    <keys/>\n`;
        }
        refXml += `${indent}  </${label}>\n`;
        return refXml;
      };
      xml += serializeRef((element as any).first, "first");
      xml += serializeRef((element as any).second, "second");
      // AnnotatedRelationshipElement: annotations are child elements
      if (tagName === "annotatedRelationshipElement") {
        const kids = Array.isArray(element.children) ? element.children : [];
        if (kids.length > 0) {
          xml += `${indent}  <annotations>\n`;
          for (const child of kids) {
            xml += generateElementXml(child, indent + "    ");
          }
          xml += `${indent}  </annotations>\n`;
        }
      }
    } else if (tagName === "range") {
      const vt = normalizeValueType(element.valueType) || "xs:string";
      xml += `${indent}  <valueType>${escapeXml(vt)}</valueType>\n`;
      const rangeVal = element.value as any;
      const minVal = rangeVal?.min ?? (typeof rangeVal === 'object' ? '' : '');
      const maxVal = rangeVal?.max ?? (typeof rangeVal === 'object' ? '' : '');
      xml += `${indent}  <min>${escapeXml(String(minVal))}</min>\n`;
      xml += `${indent}  <max>${escapeXml(String(maxVal))}</max>\n`;
    } else if (tagName === "entity") {
      const entityType = (element as any).entityType || "CoManagedEntity";
      xml += `${indent}  <entityType>${escapeXml(entityType)}</entityType>\n`;
      const kids = Array.isArray(element.children) ? element.children : [];
      if (kids.length > 0) {
        xml += `${indent}  <statements>\n`;
        for (const child of kids) {
          xml += generateElementXml(child, indent + "    ");
        }
        xml += `${indent}  </statements>\n`;
      }
    }

    xml += `${indent}</${tagName}>\n`;
    return xml;
  }

  const generateFinalAAS = async () => {
    setIsGenerating(true)

    // Helper to prefix XML schema types for valueType
    const prefixXs = (type: string | undefined) => {
      if (!type) return undefined;
      const commonTypes = ['string', 'integer', 'boolean', 'float', 'double', 'date', 'dateTime', 'time', 'anyURI', 'base64Binary', 'hexBinary', 'decimal', 'byte', 'short', 'int', 'long', 'unsignedByte', 'unsignedShort', 'unsignedInt', 'unsignedLong', 'duration', 'gDay', 'gMonth', 'gMonthDay', 'gYear', 'gYearMonth'];
      return commonTypes.includes(type) && !type.startsWith('xs:') ? `xs:${type}` : type;
    };

    try {
      // NEW: Option 1 — if the model was validated and we still have the original XML,
      // package those exact bytes instead of regenerating.
      // NEW: Only reuse original XML if it's already AAS 3.x; upgrade legacy 1.0/3.0 on export
      const isLegacy10 = !!originalXml && (/http:\/\/www\.admin-shell\.io\/aas\/1\/0/i.test(originalXml) || /<aas:aasenv/i.test(originalXml));
      const is3xXml = !!originalXml && /https:\/\/admin-shell\.io\/aas\/3\/[01]/i.test(originalXml);
      const preferOriginalXml = hasValidated && !!originalXml && originalXml.trim().length > 0 && is3xXml;

      if (preferOriginalXml) {
        // Build AASX zip with the original XML
        const zip = new JSZip();
        const xmlFileName = `${aasConfig.idShort}.xml`;
        zip.file(xmlFileName, originalXml!);
        setLastGeneratedXml(originalXml!);

        // Include a JSON model for compatibility (from current in-memory state)
        const jsonEnvironment = buildJsonEnvironment();
        zip.file("model.json", JSON.stringify(jsonEnvironment, null, 2));

        // Add any File attachments present in the editor state
        const addFilesFromElements = (elements: SubmodelElement[]) => {
          elements.forEach((element) => {
            if (element.modelType === "File" && element.fileData) {
              const base64Data = element.fileData.content.split(",")[1];
              const binaryData = atob(base64Data);
              const arrayBuffer = new ArrayBuffer(binaryData.length);
              const uint8Array = new Uint8Array(arrayBuffer);
              for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
              }
              zip.file(`files/${element.fileData.fileName}`, uint8Array);
            }
            if (element.children) addFilesFromElements(element.children);
          });
        };
        aasConfig.selectedSubmodels.forEach((sm) => {
          addFilesFromElements(submodelData[sm.idShort] || []);
        });

        // Add thumbnail (if present) to the root
        if (thumbnail) {
          const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/);
          if (mimeTypeMatch) {
            const mime = mimeTypeMatch[1];
            const ext = mimeTypeMatch[2] === "svg+xml" ? "svg" : mimeTypeMatch[2];
            const thumbName = `thumbnail.${ext}`;
            const base64Data = thumbnail.split(",")[1];
            const binaryData = atob(base64Data);
            const arrayBuffer = new ArrayBuffer(binaryData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < binaryData.length; i++) {
              uint8Array[i] = binaryData.charCodeAt(i);
            }
            zip.file(thumbName, uint8Array);
          }
        }

        // AASX relationship structure
        zip.file(
          "aasx/aasx-origin",
          `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/${xmlFileName}</originPath>
</origin>`
        );
        zip.file(
          "_rels/.rels",
          `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`
        );
        const relId = "R" + Math.random().toString(16).slice(2);
        zip.file(
          "_rels/aasx-original.rels",
          `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${xmlFileName}" Id="${relId}" /></Relationships>`
        );
        zip.file(
          "[Content_Types].xml",
          `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="png" ContentType="image/png" /><Default Extension="pdf" ContentType="application/pdf" /><Default Extension="json" ContentType="text/plain" /><Override PartName="/aasx/aasx-origin" ContentType="text/plain" /></Types>`
        );

        const blob = await zip.generateAsync({ type: "blob" });

        if (onFileGenerated) {
          const aasxFile = new File([blob], `${aasConfig.idShort}.aasx`, { type: "application/zip" });
          const results = await processFile(aasxFile, () => {});
          if (results && results.length > 0) {
            onFileGenerated(results[0]);
          } else {
            onFileGenerated({
              file: aasxFile.name,
              type: "AASX",
              valid: true,
              processingTime: 0,
              thumbnail: thumbnail || undefined,
            });
          }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${aasConfig.idShort}.aasx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("AASX exported using your original 3.x XML.");
        return; // Skip generator path
      }

      // VALIDATION: only run internal validation if user hasn't already validated
      if (!hasValidated) {
        const internalValidation = validateAAS()
        if (!internalValidation.valid) {
          setInternalIssues(internalValidation.missingFields)
          toast.error(`Please fill all required fields (${internalValidation.missingFields.length} missing).`)
          console.table(internalValidation.missingFields)
          setIsGenerating(false)
          return
        }
      }
      // Clear internal validation errors after successful validation or when already validated
      setValidationErrors(new Set())
      setInternalIssues([])

      // Collect all unique concept descriptions
      const collectedConceptDescriptions: Record<string, ConceptDescription> = {};

      const collectConcepts = (elements: SubmodelElement[]) => {
        elements.forEach(element => {
          if (element.semanticId) {
            const conceptId = typeof element.semanticId === "string"
              ? element.semanticId
              : (element.semanticId as any).keys?.[0]?.value || "";
            if (conceptId && !collectedConceptDescriptions[conceptId]) {
              // Use idShort from the element as a fallback for concept description idShort
              const conceptIdShort = element.idShort;
              collectedConceptDescriptions[conceptId] = {
                id: conceptId,
                idShort: conceptIdShort, // Use element's idShort as concept's idShort
                preferredName: typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName,
                shortName: typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName,
                description: element.description,
                dataType: element.dataType,
                unit: element.unit,
                category: element.category,
                valueType: element.valueType,
              };
            }
          }
          if (element.children) {
            collectConcepts(element.children);
          }
        });
      };

      aasConfig.selectedSubmodels.forEach(sm => {
        const elements = submodelData[sm.idShort] || [];
        collectConcepts(elements);
      });

      // Reuse the XML already built by handleValidate if data hasn't changed (hasValidated=true means
      // lastGeneratedXml is fresh). Only re-build if validation hasn't run yet.
      const aasXml = (hasValidated && lastGeneratedXml) ? lastGeneratedXml : buildCurrentXml();

      // Store for debugging and perform XML schema validation
      if (!hasValidated || !lastGeneratedXml) setLastGeneratedXml(aasXml)
      console.log("[v0] EDITOR: Starting XML schema validation for generated AAS...")
      console.log("[v0] EDITOR: Generated XML length:", aasXml.length)
      // Debug: Log the first 2000 characters to verify structure
      console.log("[v0] EDITOR: XML preview:", aasXml.substring(0, 2000))
      const xmlValidationResult = await validateAASXXml(aasXml)

      if (!xmlValidationResult.valid) {
        // ADD: surface XML schema errors panel + toast
        const errs = Array.isArray(xmlValidationResult.errors) ? xmlValidationResult.errors.map((e: any) => (typeof e === 'string' ? e : e.message || String(e))) : ['Unknown XML validation error']
        setExternalIssues(errs)
        toast.error(`Generated XML is invalid (${errs.length} errors). See details below.`)
        console.table(xmlValidationResult.errors)
        setIsGenerating(false)
        return
      }
      console.log("[v0] EDITOR: XML schema validation PASSED.")
      setExternalIssues([]) // ADD: clear XML errors on success

      // Create AASX file (ZIP format)
      try {
        const zip = new JSZip()
        
        // Add the main AAS XML file
        const xmlFileName = `${aasConfig.idShort}.xml`
        zip.file(xmlFileName, aasXml)

        // ALSO: create a JSON version and add as model.json for compatibility
        const mapElementToJson = (element: SubmodelElement): any => {
          const base: any = {
            idShort: element.idShort,
            modelType: element.modelType,
          };
          if (element.category) base.category = element.category;
          if (element.description) {
            const descText = typeof element.description === 'string' ? element.description : String(element.description);
            base.description = [{ language: 'en', text: descText }];
          }
          // AAS 3.1: semanticId requires type field; skip for ReferenceElement (not allowed)
          if (element.semanticId && element.modelType !== "ReferenceElement") {
            base.semanticId = {
              type: "ExternalReference",
              keys: [{ type: "GlobalReference", value: element.semanticId }]
            };
          }
          // Persist metadata directly for the visualizer
          if (element.preferredName) {
            base.preferredName = typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName;
          }
          if (element.shortName) {
            base.shortName = typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName;
          }
          if (element.unit) {
            base.unit = element.unit;
          }
          if (element.dataType) {
            base.dataType = element.dataType;
          }
          if (element.cardinality) {
            base.cardinality = element.cardinality;
          }

          switch (element.modelType) {
            case "Property":
              return {
                ...base,
                valueType: prefixXs(element.valueType || "string"),
                value: typeof element.value === 'string' ? element.value : undefined,
              };
            case "MultiLanguageProperty": {
              let valueArr: any[] = [];
              if (element.value && typeof element.value === 'object') {
                valueArr = Object.entries(element.value as Record<string, string>)
                  .filter(([_, text]) => text && String(text).trim() !== '')
                  .map(([language, text]) => ({ language, text }));
              }
              return {
                ...base,
                value: valueArr,
              };
            }
            case "File":
              return {
                ...base,
                value: typeof element.value === 'string' ? element.value : '',
                contentType: element.fileData?.mimeType || 'application/octet-stream',
              };
            case "SubmodelElementCollection":
            case "SubmodelElementList":
              return {
                ...base,
                value: Array.isArray(element.children) ? element.children.map(mapElementToJson) : [],
              };
            case "RelationshipElement":
            case "AnnotatedRelationshipElement": {
              const normalizeRef = (ref: any) => {
                if (!ref || typeof ref !== 'object') return { type: "ModelReference", keys: [] };
                return {
                  type: ref.type || "ModelReference",
                  keys: Array.isArray(ref.keys) ? ref.keys.map((k: any) => ({
                    type: (typeof k === 'object' && k !== null) ? (k.type || "Referable") : "Referable",
                    value: (typeof k === 'object' && k !== null) ? (k.value || "") : (typeof k === 'string' ? k : ""),
                  })) : [],
                };
              };
              const relResult: any = {
                ...base,
                first: normalizeRef((element as any).first),
                second: normalizeRef((element as any).second),
              };
              if (element.modelType === "AnnotatedRelationshipElement" && Array.isArray(element.children) && element.children.length > 0) {
                relResult.annotations = element.children.map(mapElementToJson);
              }
              return relResult;
            }
            default:
              return base;
          }
        };

        const jsonSubmodels = aasConfig.selectedSubmodels.map(sm => {
          const elements = submodelData[sm.idShort] || [];
          return {
            idShort: sm.idShort,
            id: `${aasConfig.id}/submodels/${sm.idShort}`,
            kind: "Instance",
            semanticId: {
              type: "ExternalReference",
              keys: [{
                type: "GlobalReference",
                value: sm.template.url || `https://admin-shell.io/submodels/${sm.idShort}`
              }]
            },
            submodelElements: elements.map(mapElementToJson),
          };
        });

        // Build shells array (multi-AAS support)
        const exportShells = aasConfig.shells && aasConfig.shells.length > 0
          ? aasConfig.shells
          : [{ idShort: aasConfig.idShort, id: aasConfig.id, assetKind: aasConfig.assetKind, globalAssetId: aasConfig.globalAssetId, submodelIds: jsonSubmodels.map(sm => sm.id) }];

        const jsonShells = exportShells.map(shell => {
          const shellSubmodelRefs = jsonSubmodels
            .filter(sm => shell.submodelIds.length === 0 || shell.submodelIds.includes(sm.id))
            .map(sm => ({
              type: "ModelReference",
              keys: [{ type: "Submodel", value: sm.id }]
            }));

          return {
            id: shell.id,
            idShort: shell.idShort,
            assetInformation: {
              assetKind: shell.assetKind || "Instance",
              globalAssetId: shell.globalAssetId || shell.idShort || "urn:placeholder",
            },
            submodels: shellSubmodelRefs,
          };
        });

        // Build conceptDescriptions (compact IEC 61360 JSON)
        const jsonConceptDescriptions = Object.values(collectedConceptDescriptions).map(concept => {
          const ensuredPreferredName = (concept.preferredName && Object.values(concept.preferredName).some(v => v && String(v).trim() !== ""))
            ? concept.preferredName!
            : { en: concept.idShort };
          const preferredNameArr = Object.entries(ensuredPreferredName).map(([language, text]) => ({ language, text }));
          const shortNameArr = concept.shortName
            ? Object.entries(concept.shortName).map(([language, text]) => ({ language, text }))
            : undefined;
          const definitionArr = concept.description
            ? [{ language: "en", text: concept.description }]
            : undefined;

          return {
            id: concept.id,
            idShort: concept.idShort,
            embeddedDataSpecifications: [
              {
                dataSpecification: {
                  type: "ExternalReference",
                  keys: [
                    { type: "GlobalReference", value: "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360" }
                  ]
                },
                dataSpecificationContent: {
                  dataSpecificationIec61360: {
                    preferredName: preferredNameArr,
                    ...(shortNameArr && { shortName: shortNameArr }),
                    ...(concept.unit && { unit: concept.unit }),
                    ...(concept.dataType && { dataType: concept.dataType }),
                    ...(definitionArr && { definition: definitionArr })
                  }
                }
              }
            ]
          };
        });

        const jsonEnvironment = {
          assetAdministrationShells: jsonShells,
          submodels: jsonSubmodels,
          conceptDescriptions: jsonConceptDescriptions
        };

        zip.file("model.json", JSON.stringify(jsonEnvironment, null, 2));

        const addFilesFromElements = (elements: SubmodelElement[]) => {
          elements.forEach(element => {
            if (element.modelType === "File" && element.fileData) {
              // Convert base64 data URL to blob
              const base64Data = element.fileData.content.split(',')[1]
              const binaryData = atob(base64Data)
              const arrayBuffer = new ArrayBuffer(binaryData.length)
              const uint8Array = new Uint8Array(arrayBuffer)
              for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i)
              }
              
              // Add file to /files directory in AASX
              zip.file(`files/${element.fileData.fileName}`, uint8Array)
            }
            
            // Recursively check children
            if (element.children) {
              addFilesFromElements(element.children)
            }
          })
        }
        
        // Add all files from all submodels
        aasConfig.selectedSubmodels.forEach(sm => {
          const elements = submodelData[sm.idShort] || []
          addFilesFromElements(elements)
        })
        
        // Add thumbnail (if present) to the root
        if (thumbnail) {
          const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/)
          if (mimeTypeMatch) {
            const ext = mimeTypeMatch[2] === "svg+xml" ? "svg" : mimeTypeMatch[2]
            const thumbName = `thumbnail.${ext}`
            const base64Data = thumbnail.split(',')[1]
            const binaryData = atob(base64Data)
            const arrayBuffer = new ArrayBuffer(binaryData.length)
            const uint8Array = new Uint8Array(arrayBuffer)
            for (let i = 0; i < binaryData.length; i++) {
              uint8Array[i] = binaryData.charCodeAt(i)
            }
            zip.file(thumbName, uint8Array)
          }
        }
        
        // Add aasx-origin file (required for AASX structure)
        zip.file("aasx/aasx-origin", `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/${xmlFileName}</originPath>
</origin>`)
        
        // Add relationships file
        zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`)

        // ADD: [Content_Types].xml (OPC) and _rels/aasx-original.rels pointing to main AAS XML
        const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="png" ContentType="image/png" /><Default Extension="pdf" ContentType="application/pdf" /><Default Extension="json" ContentType="text/plain" /><Override PartName="/aasx/aasx-origin" ContentType="text/plain" /></Types>`;
        zip.file("[Content_Types].xml", contentTypesXml);

        const relId = "R" + Math.random().toString(16).slice(2);
        const aasxOriginalRels = `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${xmlFileName}" Id="${relId}" /></Relationships>`;
        zip.file("_rels/aasx-original.rels", aasxOriginalRels);

        // Generate ZIP file
        const blob = await zip.generateAsync({ type: "blob" })
        
        console.log("[v0] AASX file (XML + model.json) generated successfully")

        // Parse the generated AASX just like the Upload tab does, so Visualizer receives real data
        if (onFileGenerated) {
          const aasxFile = new File([blob], `${aasConfig.idShort}.aasx`, { type: "application/zip" })
          const results = await processFile(aasxFile, () => {})
          if (results && results.length > 0) {
            onFileGenerated(results[0])
          } else {
            onFileGenerated({
              file: aasxFile.name,
              type: "AASX",
              valid: true,
              processingTime: 0,
              thumbnail: thumbnail || undefined,
            })
          }
        }

        // Download the AASX file
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${aasConfig.idShort}.aasx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        // ADD: success toast
        toast.success("AASX file generated successfully.")
        
      } catch (error) {
        console.error("[v0] Error generating AASX file:", error)
        toast.error("Failed to generate AASX file. Please try again.")
      }
    } catch (error) {
      console.error("[v0] Error generating AASX file:", error)
      toast.error("Failed to generate AASX file. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  const validateAAS = (): { valid: boolean; missingFields: string[] } => {
    const missingFields: string[] = []
    const errors: Set<string> = new Set()
    const nodesToExpand: Set<string> = new Set()
    
    const validateElements = (elements: SubmodelElement[], submodelId: string, path: string[] = []) => {
      elements.forEach(element => {
        const currentPath = [...path, element.idShort]
        const nodeId = currentPath.join('.')
        const isRequired = element.cardinality === "One" || element.cardinality === "OneToMany"

        // NEW: Property must have valueType or IEC Data Type
        if (element.modelType === "Property") {
          const hasValueType = !!normalizeValueType(element.valueType);
          const hasIECType = !!element.dataType && String(element.dataType).trim() !== "";
          if (!hasValueType && !hasIECType) {
            missingFields.push(`${submodelId} > ${currentPath.join(' > ')} (set Value Type or IEC Data Type)`);
            errors.add(nodeId);
            for (let i = 0; i < currentPath.length - 1; i++) {
              const parentPath = currentPath.slice(0, i + 1).join('.');
              nodesToExpand.add(parentPath);
            }
          }

          // ADD: value must match declared xs:* type
          const vtNorm = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType);
          if (vtNorm && typeof element.value === 'string' && element.value.trim() !== '') {
            if (!isValidValueForXsdType(vtNorm, element.value)) {
              missingFields.push(`${submodelId} > ${currentPath.join(' > ')} (value "${element.value}" doesn't match ${vtNorm})`);
              errors.add(nodeId);
              for (let i = 0; i < currentPath.length - 1; i++) {
                const parentPath = currentPath.slice(0, i + 1).join('.');
                nodesToExpand.add(parentPath);
              }
            }
          }
        }
        
        if (isRequired) {
          let hasValue = false
          
          if (element.modelType === "Property") {
            hasValue = typeof element.value === 'string' && element.value.trim() !== ''
          } else if (element.modelType === "MultiLanguageProperty") {
            if (typeof element.value === 'object' && element.value !== null) {
              const values = Object.values(element.value as Record<string, string>).filter(v => v && v.trim() !== '')
              hasValue = values.length > 0
            }
          } else if (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList") {
            hasValue = !!(element.children && element.children.length > 0)
          } else if (element.modelType === "File") {
            // NEW: File required -> need a path or uploaded file
            hasValue = (typeof element.value === 'string' && element.value.trim() !== '') || !!element.fileData
          }
          
          if (!hasValue && (element.modelType === "Property" || element.modelType === "MultiLanguageProperty" || element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList" || element.modelType === "File")) {
            missingFields.push(`${submodelId} > ${currentPath.join(' > ')}`)
            errors.add(nodeId)
            
            for (let i = 0; i < currentPath.length - 1; i++) {
              const parentPath = currentPath.slice(0, i + 1).join('.')
              nodesToExpand.add(parentPath)
            }
          }
        }
        
        // Warn when PropertySet has no property containers
        if (element.idShort === "PropertySet" && element.modelType === "SubmodelElementCollection" && (!element.children || element.children.length === 0)) {
          missingFields.push(`${submodelId} > ${currentPath.join(' > ')} (PropertySet should contain at least one property container)`)
          errors.add(nodeId)
          for (let i = 0; i < currentPath.length - 1; i++) {
            const parentPath = currentPath.slice(0, i + 1).join('.')
            nodesToExpand.add(parentPath)
          }
        }

        if (element.children && element.children.length > 0) {
          validateElements(element.children, submodelId, currentPath)
        }
      })
    }

    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || []
      validateElements(elements, sm.idShort)
    })
    
    setValidationErrors(errors)
    setExpandedNodes(prev => new Set([...prev, ...nodesToExpand]))
    
    return {
      valid: missingFields.length === 0,
      missingFields
    }
  }

  // Add a submodel from one of our built-in local IDTA templates (no GitHub fetch needed)
  const addLocalTemplate = (localTemplate: LocalSubmodelTemplate) => {
    const built = localTemplate.buildSubmodel(aasConfig.id || 'urn:example')
    const idShort = built.idShort

    // Map our template elements (which already use the editor's element shape) directly
    const mapLocalElement = (el: any): any => {
      const base: any = {
        idShort: el.idShort,
        modelType: el.modelType || 'Property',
        cardinality: el.cardinality || 'ZeroToOne',
        description: el.description ? (Array.isArray(el.description) ? el.description[0]?.text : el.description) : undefined,
        semanticId: el.semanticId?.keys?.[0]?.value || el.semanticId || undefined,
        valueType: el.valueType,
        unit: el.unit,
        value: el.value ?? '',
      }
      if (el.children) {
        base.children = (el.children as any[]).map(mapLocalElement)
      }
      return base
    }

    const structure = ((built as any).submodelElements || []).map(mapLocalElement)

    const syntheticGithubTemplate: SubmodelTemplate = {
      name: built.idShort,
      version: localTemplate.version,
      description: localTemplate.description,
      url: built.semanticId?.keys?.[0]?.value || `https://admin-shell.io/${built.idShort}`,
    }

    const newSubmodel: SelectedSubmodel = { template: syntheticGithubTemplate, idShort }
    const newAASConfig = { ...aasConfig, selectedSubmodels: [...aasConfig.selectedSubmodels, newSubmodel] }
    onUpdateAASConfig(newAASConfig)
    setSubmodelData(prev => ({ ...prev, [idShort]: structure }))
    setShowAddSubmodel(false)
    setSelectedSubmodel(newSubmodel)
    toast.success(`Added "${idShort}" submodel from IDTA template`)
  }

  const addSubmodel = async (template: SubmodelTemplate) => {
    const newSubmodel: SelectedSubmodel = {
      template,
      idShort: template.name.replace(/\s+/g, '')
    }

    const fetchedStructure = await fetchTemplateDetails(template.name)
    const structure = fetchedStructure || generateTemplateStructure(template.name, template.url)
    
    // Create a new AASConfig object with the updated selectedSubmodels array
    const updatedSelectedSubmodels = [...aasConfig.selectedSubmodels, newSubmodel];
    const newAASConfig = { ...aasConfig, selectedSubmodels: updatedSelectedSubmodels };
    
    onUpdateAASConfig(newAASConfig); // Call the callback to update parent state

    setSubmodelData(prev => ({
      ...prev,
      [newSubmodel.idShort]: structure
    }))
    setShowAddSubmodel(false)
    setSelectedSubmodel(newSubmodel)
  }

  const removeSubmodel = (idShort: string) => {
    const index = aasConfig.selectedSubmodels.findIndex(sm => sm.idShort === idShort)
    if (index !== -1) {
      // Create a new AASConfig object without the removed submodel
      const updatedSelectedSubmodels = aasConfig.selectedSubmodels.filter(sm => sm.idShort !== idShort);
      // FIX: corrected variable name
      const newAASConfig = { ...aasConfig, selectedSubmodels: updatedSelectedSubmodels };
      
      onUpdateAASConfig(newAASConfig); // Call the callback to update parent state

      const newData = { ...submodelData }
      delete newData[idShort]
      setSubmodelData(newData)
      
      if (selectedSubmodel?.idShort === idShort) {
        setSelectedSubmodel(aasConfig.selectedSubmodels[0] || null)
        setSelectedElement(null)
      }
    }
  }

  const deleteElement = (submodelId: string, path: string[]) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const deleteFromElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 1) {
          // Delete at this level
          return elements.filter(el => el.idShort !== currentPath[0])
        }
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current && el.children) {
            return { ...el, children: deleteFromElements(el.children, rest) }
          }
          return el
        })
      }
      
      newData[submodelId] = deleteFromElements(newData[submodelId], path)
      return newData
    })
    
    // Clear selection if deleted element was selected
    if (selectedElement && path[path.length - 1] === selectedElement.idShort) {
      setSelectedElement(null)
    }
  }

  const canDelete = (cardinality: string): boolean => {
    return cardinality === "ZeroToOne" || cardinality === "ZeroToMany"
  }

  // All available element types for the add dialog
  const ALL_ELEMENT_TYPES: { value: string; label: string; description: string }[] = [
    { value: "Property", label: "Property", description: "A single value with a data type" },
    { value: "MultiLanguageProperty", label: "Multi-Language Property", description: "A value in multiple languages" },
    { value: "SubmodelElementCollection", label: "Collection (SMC)", description: "A container for child elements" },
    { value: "SubmodelElementList", label: "List (SML)", description: "An ordered list of elements" },
    { value: "File", label: "File", description: "A reference to a file" },
    { value: "Blob", label: "Blob", description: "Binary data stored inline" },
    { value: "Range", label: "Range", description: "A value range with min and max" },
    { value: "ReferenceElement", label: "Reference Element", description: "A reference to another element" },
    { value: "Entity", label: "Entity", description: "An entity with optional asset ID" },
    { value: "Capability", label: "Capability", description: "A capability of the asset" },
    { value: "CapabilityName", label: "Capability Name", description: "IDTA CapabilityName with Capability, Comment, PropertySet & Relations" },
    { value: "Operation", label: "Operation", description: "An operation with inputs/outputs" },
    { value: "BasicEventElement", label: "Basic Event Element", description: "An event element" },
    { value: "RelationshipElement", label: "Relationship Element", description: "A relationship between two elements" },
    { value: "AnnotatedRelationshipElement", label: "Annotated Relationship", description: "A relationship with annotations" },
  ];

  // Open add element dialog
  const openAddElementDialog = (parentPath: string[] | null = null) => {
    setAddElementParentPath(parentPath);
    setAddElementStep(1);
    setNewElementType("Property");
    setNewElementIdShort("");
    setNewElementCardinality("ZeroToOne");
    setNewElementDescription("");
    setNewElementSemanticId("");
    setNewElementValueType("xs:string");
    setNewElementEntityType("CoManagedEntity");
    setShowAddElementDialog(true);
  };

  // Create a new element based on type
  const createNewElement = (): SubmodelElement => {
    // Handle CapabilityName — adds a new CapabilityName SMC (to nest inside an existing CapabilitySet)
    if (newElementType === "CapabilityName") {
      return {
        idShort: newElementIdShort.trim() || "CapabilityName",
        modelType: "SubmodelElementCollection",
        cardinality: newElementCardinality,
        description: newElementDescription.trim() || "A named capability container",
        semanticId: newElementSemanticId.trim() || undefined,
        children: [
          { idShort: "Capability1", modelType: "Capability", cardinality: "One", description: "The capability element",
            qualifiers: [
              { type: "CapabilityRoleQualifier/Offered", valueType: "xs:boolean", value: "false", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Offered/1/0" },
              { type: "CapabilityRoleQualifier/Required", valueType: "xs:boolean", value: "false", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/Required/1/0" },
              { type: "CapabilityRoleQualifier/NotAssigned", valueType: "xs:boolean", value: "true", semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRoleQualifier/NotAssigned/1/0" },
            ] },
          { idShort: "CapabilityComment", modelType: "MultiLanguageProperty", cardinality: "ZeroToOne", description: "Comment about this capability" },
          { idShort: "PropertySet", modelType: "SubmodelElementCollection", cardinality: "ZeroToMany", description: "Set of properties for this capability",
            semanticId: "https://admin-shell.io/idta/CapabilityDescription/PropertySet/1/0", children: [] },
          { idShort: "CapabilityRelations", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne", description: "Relations and constraints",
            semanticId: "https://admin-shell.io/idta/CapabilityDescription/CapabilityRelations/1/0", children: [] },
        ],
      };
    }

    const base: SubmodelElement = {
      idShort: newElementIdShort.trim(),
      modelType: newElementType as SubmodelElementModelType,
      cardinality: newElementCardinality,
      description: newElementDescription.trim() || undefined,
      semanticId: newElementSemanticId.trim() || undefined,
    };

    switch (newElementType) {
      case "Property":
        return { ...base, valueType: newElementValueType, value: "" };
      case "MultiLanguageProperty":
        return { ...base, value: { en: "" } };
      case "SubmodelElementCollection":
      case "SubmodelElementList":
        return { ...base, children: [] };
      case "File":
        return { ...base, value: "", contentType: "" };
      case "Blob":
        return { ...base, value: "", contentType: "application/octet-stream" };
      case "Range":
        return { ...base, valueType: newElementValueType, min: "", max: "" };
      case "ReferenceElement":
        return { ...base, value: { type: "ModelReference", keys: [] } };
      case "Entity":
        return { ...base, entityType: newElementEntityType, children: [] };
      case "Capability":
        return { ...base };
      case "Operation":
        return { ...base, inputVariables: [], outputVariables: [], inoutputVariables: [] } as any;
      case "BasicEventElement":
        return { ...base, observed: { type: "ModelReference", keys: [] } } as any;
      case "RelationshipElement":
      case "AnnotatedRelationshipElement":
        return { ...base, first: { type: "ModelReference", keys: [] }, second: { type: "ModelReference", keys: [] } };
      default:
        return base;
    }
  };

  // Add element to the submodel data
  const addElement = () => {
    if (!selectedSubmodel || !newElementIdShort.trim()) {
      toast.error("Please enter a valid idShort");
      return;
    }

    // Validate idShort format
    const idShortRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    if (!idShortRegex.test(newElementIdShort.trim())) {
      toast.error("idShort must start with a letter and contain only letters, digits, underscores, or hyphens");
      return;
    }

    const submodelId = selectedSubmodel.idShort;
    const newElement = createNewElement();

    setSubmodelData((prev) => {
      const newData = { ...prev };

      if (addElementParentPath === null || addElementParentPath.length === 0) {
        // Add at root level of the submodel
        const existingElements = newData[submodelId] || [];
        // Check for duplicate idShort
        if (existingElements.some(el => el.idShort === newElement.idShort)) {
          toast.error(`An element with idShort "${newElement.idShort}" already exists at this level`);
          return prev;
        }
        newData[submodelId] = [...existingElements, newElement];
      } else {
        // Add as child of a collection
        const addToElements = (elements: SubmodelElement[], path: string[]): SubmodelElement[] => {
          if (path.length === 0) {
            // Check for duplicate
            if (elements.some(el => el.idShort === newElement.idShort)) {
              toast.error(`An element with idShort "${newElement.idShort}" already exists at this level`);
              return elements;
            }
            return [...elements, newElement];
          }

          const [current, ...rest] = path;
          return elements.map(el => {
            if (el.idShort === current) {
              const children = el.children || [];
              if (rest.length === 0) {
                // Check for duplicate at target level
                if (children.some(c => c.idShort === newElement.idShort)) {
                  toast.error(`An element with idShort "${newElement.idShort}" already exists at this level`);
                  return el;
                }
                return { ...el, children: [...children, newElement] };
              }
              return { ...el, children: addToElements(children, rest) };
            }
            return el;
          });
        };

        newData[submodelId] = addToElements(newData[submodelId] || [], addElementParentPath);
      }

      return newData;
    });

    // Expand the parent if needed
    if (addElementParentPath && addElementParentPath.length > 0) {
      const nodeId = addElementParentPath.join('.');
      setExpandedNodes(prev => new Set([...prev, nodeId]));
    }

    toast.success(`Added ${newElementType} "${newElementIdShort}"`);
    setShowAddElementDialog(false);

    // Select the new element
    setTimeout(() => {
      const path = addElementParentPath ? [...addElementParentPath, newElementIdShort] : [newElementIdShort];
      const findByPath = (els: SubmodelElement[], p: string[], idx = 0): SubmodelElement | null => {
        if (idx >= p.length) return null;
        const cur = els.find(e => e.idShort === p[idx]);
        if (!cur) return null;
        if (idx === p.length - 1) return cur;
        return cur.children ? findByPath(cur.children, p, idx + 1) : null;
      };
      // Use the updated data
      setSubmodelData(current => {
        const found = findByPath(current[submodelId] || [], path);
        if (found) {
          setSelectedElement(found);
          setSelectedElementPath(path);
        }
        return current;
      });
    }, 100);
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setThumbnail(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }

  const filteredTemplates = availableTemplates.filter(template =>
    template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(templateSearchQuery.toLowerCase())
  )

  // ADD: helper to navigate to a missing field path like "SubmodelId > A > B > C"
  const goToIssuePath = (issue: string) => {
    const parts = issue.split('>').map(p => p.trim()).filter(Boolean)
    if (parts.length < 2) return
    const submodelId = parts[0]
    const pathSegments = parts.slice(1)

    const sm = aasConfig.selectedSubmodels.find(s => s.idShort === submodelId)
    if (!sm) return

    setSelectedSubmodel(sm)

    // Expand nodes along the path
    const newExpanded = new Set(expandedNodes)
    const cumulative: string[] = []
    pathSegments.forEach(seg => {
      cumulative.push(seg)
      newExpanded.add(cumulative.join('.'))
    })
    setExpandedNodes(newExpanded)

    // Find element by path and select it
    const elements = submodelData[submodelId] || []
    const findByPath = (els: SubmodelElement[], path: string[], idx = 0): SubmodelElement | null => {
      if (idx >= path.length) return null
      const cur = els.find(e => e.idShort === path[idx])
      if (!cur) return null
      if (idx === path.length - 1) return cur
      return cur.children ? findByPath(cur.children, path, idx + 1) : null
    }
    const target = findByPath(elements, pathSegments)
    if (target) setSelectedElement(target)
  }

  // NEW: find the first path for a given idShort across all submodels
  const findFirstPathForIdShort = (needle: string): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort]
          if (el.idShort === needle) return `${submodelId} > ${curChain.join(' > ')}`
          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain)
            if (found) return found
          }
        }
        return null
      }
      const res = walk(submodelData[submodelId] || [], [])
      if (res) return res
    }
    return null
  }

  // NEW: gather paths for ReferenceElements missing keys to enable Go to buttons
  const findReferenceElementsMissingKeys = (): string[] => {
    const paths: string[] = []
    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort]
        if (el.modelType === "ReferenceElement") {
          const v: any = el.value
          const missing = !v || typeof v !== "object" || !Array.isArray(v.keys) || v.keys.length === 0
          if (missing) {
            paths.push(`${smId} > ${nextChain.join(' > ')}`)
          }
        }
        if (Array.isArray(el.children) && el.children.length) {
          walk(el.children, smId, nextChain)
        }
      })
    }
    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, [])
    })
    return paths
  }

  // NEW: find the first element path that has a semanticId (to help fix conceptDescriptions error)
  const findFirstSemanticElementPath = (): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort]
          if (el.semanticId && String(el.semanticId).trim() !== "") {
            return `${submodelId} > ${curChain.join(' > ')}`
          }
          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain)
            if (found) return found
          }
        }
        return null
      }
      const res = walk(submodelData[submodelId] || [], [])
      if (res) return res
    }
    return null
  }

  // NEW: Convert string errors to ValidationAlert format
  const convertToValidationAlerts = useCallback((
    internalErrors: string[],
    xmlErrors: any[],
    jsonErrors: any[]
  ): ValidationAlert[] => {
    const alerts: ValidationAlert[] = [];

    // Convert internal (required field) errors - these are blocking
    internalErrors.forEach(err => {
      const parts = err.split('>').map(p => p.trim()).filter(Boolean);
      const path = parts.length > 1 ? parts.join(' > ') : err;
      const fieldName = parts[parts.length - 1] || err;

      alerts.push({
        fieldName,
        path,
        description: `Missing required field: ${fieldName}`,
        type: AlertType.ERROR,
        hint: "This field is required for a valid AAS model",
        fixable: true,
        code: "REQUIRED_FIELD"
      });
    });

    // Convert XML schema errors
    xmlErrors.forEach((err: any) => {
      const text = typeof err === "string" ? err : (err?.message || String(err));
      const line = typeof err === "object" ? (err?.loc?.lineNumber ?? undefined) : undefined;

      // Determine if this is fixable based on the error type
      const isFixable = /empty|minlength|displayname|description|embeddeddataspecifications|definition|valuereferencepairs|keys/i.test(text);

      // Determine severity - some XML errors are warnings (can proceed with fixes)
      const isWarning = /embeddeddataspecifications|displayname|shortname/i.test(text);

      alerts.push({
        fieldName: getFieldFromMessage(text) || "XML Schema",
        path: line && lastGeneratedXml ? resolvePathFromLine(lastGeneratedXml, line) || undefined : undefined,
        description: text,
        type: isWarning ? AlertType.WARNING : AlertType.ERROR,
        hint: getHintForError(text),
        line,
        fixable: isFixable,
        code: "XML_SCHEMA"
      });
    });

    // Convert JSON validation errors
    jsonErrors.forEach((err: any) => {
      const text = typeof err === "string" ? err : (err?.message || err?.path ? `${err.path}: ${err.message}` : String(err));

      alerts.push({
        fieldName: err?.path?.split('/')?.pop() || "JSON Structure",
        path: err?.path,
        description: text,
        type: AlertType.WARNING,
        hint: "Check your JSON structure matches AAS specification",
        fixable: false,
        code: "JSON_STRUCTURE"
      });
    });

    return alerts;
  }, [lastGeneratedXml]);

  // Helper to get hint for common errors
  const getHintForError = (text: string): string | undefined => {
    const lower = text.toLowerCase();
    if (lower.includes("minlength") && lower.includes("value")) return "Provide a non-empty value or remove the empty element.";
    if (lower.includes("displayname")) return "Add a language-tagged displayName entry (e.g., with language=en).";
    if (lower.includes("description")) return "Descriptions must include langStringTextType with language and text.";
    if (lower.includes("embeddeddataspecifications")) return "If present, must contain at least one embeddedDataSpecification.";
    if (lower.includes("definition")) return "Definition must include langStringDefinitionTypeIec61360 with language and text.";
    if (lower.includes("keys")) return "Keys must contain at least one key element.";
    if (lower.includes("semanticid")) return "Use ExternalReference with keys containing the semantic ID value.";
    return undefined;
  };

  // ADD: manual validate action (internal)
  const runInternalValidation = async (overrideXml?: string, options?: { openDialog?: boolean }) => {
    if (validationRunningRef.current) return;

    validationRunningRef.current = true;
    setValidationBusy(true);
    try {
      // Our internal required-fields/type checks
      const internal = validateAAS();
      setInternalIssues(internal.missingFields);

      // Build JSON for structural validation
      const env = buildJsonEnvironment();
      const jsonResult = await validateAASXJson(JSON.stringify(env));

      // Prefer override XML (from fix) if available
      const xmlBuilt =
        (overrideXml && overrideXml.trim().length > 0)
          ? overrideXml
          : (originalXml && originalXml.trim().length > 0)
            ? originalXml
            : buildCurrentXml();

      // Debug: log which XML source is being used and namespace info
      const xmlSource = overrideXml ? "overrideXml (from fix)" : originalXml ? "originalXml state" : "buildCurrentXml()";
      console.log(`[v0] Validating XML from: ${xmlSource}`);
      console.log(`[v0] XML has 3.0 namespace: ${xmlBuilt.includes("admin-shell.io/aas/3/0")}`);
      console.log(`[v0] XML has 3.1 namespace: ${xmlBuilt.includes("admin-shell.io/aas/3/1")}`);

      setLastGeneratedXml(xmlBuilt);
      const xmlResult = await validateAASXXml(xmlBuilt);

      // Preserve raw XML errors so we can show line number + friendlier hints
      const rawErrors = (xmlResult as any)?.errors || [];
      setXmlErrorsRaw(Array.isArray(rawErrors) ? rawErrors : []);
      // Also keep a normalized string list for legacy UI bits
      const xmlErrorsNormalized = Array.isArray(rawErrors)
        ? rawErrors.map((e: any) => (typeof e === 'string' ? e : (e?.message || String(e))))
        : [];
      setExternalIssues(xmlErrorsNormalized);

      const jsonErrCount = (jsonResult as any)?.errors?.length || 0;
      const xmlErrCount = Array.isArray(rawErrors) ? rawErrors.length : xmlErrorsNormalized.length;
      const internalCount = internal.missingFields.length;

      // NEW: Build ValidationAlerts from all error sources
      const jsonErrs = !jsonResult.valid && (jsonResult as any).errors ? (jsonResult as any).errors : [];
      const alerts = convertToValidationAlerts(internal.missingFields, rawErrors, jsonErrs);
      setValidationAlerts(alerts);

      // Detect service outage and notify via toast
      const serviceDown = Array.isArray(rawErrors) && rawErrors.some((e: any) => {
        const msg = typeof e === "string" ? e : (e?.message || "");
        return /validation service unavailable|validation service timeout|failed to fetch/i.test(msg);
      });
      if (serviceDown) {
        toast.warning("XML validation service is unavailable. Skipping XML check; you can still proceed.");
      }

      const allGood = internalCount === 0 && jsonResult.valid && (serviceDown ? true : xmlResult.valid);

      // Open validation result popup (respect options and dismissal)
      // Don't auto-open dialog when creating a new AAS (only show inline errors in middle panel)
      const wantOpen = options?.openDialog ?? true;
      const shouldOpen = sourceXml ? wantOpen : false;
      setValidationDialogOpen(shouldOpen);

      setValidationCounts({ internal: internalCount, json: jsonErrCount, xml: xmlErrCount });
      setValidationDialogStatus(allGood ? 'valid' : 'invalid');
      setCanGenerate(allGood);

      setHasValidated(true);

      // Only auto-save when validation passes AND the XML content has actually changed
      // since the last save — prevents duplicate entries from repeated validate clicks
      if (allGood && onSave && xmlBuilt !== lastAutoSavedXmlRef.current) {
        lastAutoSavedXmlRef.current = xmlBuilt;
        const resultToSave: ValidationResult = {
          file: `${aasConfig.idShort}.aasx`,
          type: "AASX",
          valid: true,
          processingTime: 0,
          parsed: xmlResult.parsed,
          aasData: xmlResult.aasData,
          originalXml: xmlBuilt,
          thumbnail: initialThumbnail || undefined,
          attachments: attachmentsState || attachments,
        };
        onSave(resultToSave);
        toast.success("Model saved — it will show as valid on Home and export with the corrected XML.");
      }

      // Auto-fix if all good
      if (allGood && xmlResult.valid && !serviceDown) {
        fixXmlErrors();
      }
    } finally {
      validationRunningRef.current = false;
      setValidationBusy(false);
    }
  };

  // Derive current shell from shells array or fall back to top-level config
  const currentShell: AASShell | undefined = selectedShellIndex !== null ? aasConfig.shells?.[selectedShellIndex] : undefined
  const activeIdShort = currentShell?.idShort ?? aasConfig.idShort
  const activeId = currentShell?.id ?? aasConfig.id
  const activeAssetKind = currentShell?.assetKind ?? aasConfig.assetKind
  const activeGlobalAssetId = currentShell?.globalAssetId ?? aasConfig.globalAssetId
  const hasMultipleShells = (aasConfig.shells?.length ?? 0) > 1

  // Submodels visible for the currently selected shell
  const activeShellSubmodels = currentShell
    ? aasConfig.selectedSubmodels.filter(sm => sm.submodelId ? currentShell.submodelIds.includes(sm.submodelId) : currentShell.submodelIds.includes(sm.idShort))
    : aasConfig.selectedSubmodels

  const setAASFieldValue = (field: 'idShort'|'id'|'assetKind'|'globalAssetId', value: string) => {
    if (selectedShellIndex !== null && aasConfig.shells && aasConfig.shells[selectedShellIndex]) {
      const updatedShells = [...aasConfig.shells]
      updatedShells[selectedShellIndex] = { ...updatedShells[selectedShellIndex], [field]: value }
      // Keep top-level in sync with first shell
      const topLevel = selectedShellIndex === 0 ? { [field]: value } : {}
      onUpdateAASConfig({ ...aasConfig, ...topLevel, shells: updatedShells })
    } else {
      onUpdateAASConfig({ ...aasConfig, [field]: value })
    }
  }

  const copyText = async (label: string, value?: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  // NEW: list paths for required elements with empty values
  const listRequiredEmptyValuePaths = (): string[] => {
    const paths: string[] = [];
    const isReq = (c: SubmodelElement["cardinality"]) => c === "One" || c === "OneToMany";

    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort];
        if (isReq(el.cardinality)) {
          let empty = false;
          if (el.modelType === "Property") {
            empty = !(typeof el.value === "string" && el.value.trim() !== "");
          } else if (el.modelType === "MultiLanguageProperty") {
            const obj = el.value && typeof el.value === "object" ? el.value as Record<string, string> : {};
            const hasAny = Object.values(obj).some((t) => t && String(t).trim() !== "");
            empty = !hasAny;
          } else if (el.modelType === "SubmodelElementCollection" || el.modelType === "SubmodelElementList") {
            empty = !(Array.isArray(el.children) && el.children.length > 0);
          }
          if (empty) paths.push(`${smId} > ${nextChain.join(" > ")}`);
        }
        if (Array.isArray(el.children) && el.children.length) walk(el.children, smId, nextChain);
      });
    };

    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, []);
    });

    return paths;
  };

  // NEW: gather paths with empty Description fields
  const listEmptyDescriptionPaths = (): string[] => {
    const paths: string[] = [];

    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort];
        const hasDescField = el.description != null;
        const isEmpty = typeof el.description === "string" ? el.description.trim() === "" : !el.description;
        if (hasDescField && isEmpty) {
          paths.push(`${smId} > ${nextChain.join(" > ")}`);
        }
        if (Array.isArray(el.children) && el.children.length) walk(el.children, smId, nextChain);
      });
    };

    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, []);
    });

    return paths;
  };

  // NEW: auto-fill placeholders for required empty values (safe, minimal placeholders)
  const autoFillRequiredValues = () => {
    const choosePlaceholder = (el: SubmodelElement): string | undefined => {
      const vt = normalizeValueType(el.valueType) || deriveValueTypeFromIEC(el.dataType);
      switch (vt) {
        case "xs:boolean": return "false";
        case "xs:integer":
        case "xs:int":
        case "xs:long":
        case "xs:short":
        case "xs:byte":
        case "xs:unsignedLong":
        case "xs:unsignedInt":
        case "xs:unsignedShort":
        case "xs:unsignedByte":
        case "xs:float":
        case "xs:double":
        case "xs:decimal":
          return "0";
        case "xs:anyURI": return "about:blank";
        default: return "—"; // simple, non-ambiguous string placeholder
      }
    };

    setSubmodelData((prev) => {
      const next = { ...prev };

      const fill = (els: SubmodelElement[]): SubmodelElement[] => {
        return els.map((el) => {
          // Only fill Property, MLP, File
          if ((el.cardinality === "One" || el.cardinality === "OneToMany")) {
            if (el.modelType === "Property") {
              const cur = typeof el.value === "string" ? el.value : "";
              if (!cur || cur.trim() === "") {
                const ph = choosePlaceholder(el);
                if (ph != null) {
                  return { ...el, value: ph };
                }
              }
            } else if (el.modelType === "MultiLanguageProperty") {
              const obj = el.value && typeof el.value === "object" ? { ...(el.value as Record<string, string>) } : {};
              const hasAny = Object.values(obj).some((t) => t && String(t).trim() !== "");
              if (!hasAny) {
                obj.en = obj.en && obj.en.trim() !== "" ? obj.en : "—";
                return { ...el, value: obj };
              }
            } else if (el.modelType === "File") {
              const cur = typeof el.value === "string" ? el.value : "";
              if ((!cur || cur.trim() === "") && !el.fileData) {
                // NEW: set a minimal safe URI placeholder
                return { ...el, value: "about:blank" };
              }
            }
          }
          if (Array.isArray(el.children) && el.children.length) {
            return { ...el, children: fill(el.children) };
          }
          return el;
        });
      };

      aasConfig.selectedSubmodels.forEach((sm) => {
        next[sm.idShort] = fill(next[sm.idShort] || []);
      });

      return next;
    });

    toast.success("Filled placeholders for required values.");
  };

  // NEW: remove all empty Description fields
  const removeEmptyDescriptionsAll = () => {
    setSubmodelData((prev) => {
      const next = { ...prev };
      const clean = (els: SubmodelElement[]): SubmodelElement[] => {
        return els.map((el) => {
          const hasDescField = el.description != null;
          const isEmpty = typeof el.description === "string" ? el.description.trim() === "" : !el.description;
          const cleaned = hasDescField && isEmpty ? { ...el, description: undefined } : el;
          if (Array.isArray(cleaned.children) && cleaned.children.length) {
            return { ...cleaned, children: clean(cleaned.children) };
          }
          return cleaned;
        });
      };
      aasConfig.selectedSubmodels.forEach((sm) => {
        next[sm.idShort] = clean(next[sm.idShort] || []);
      });
      return next;
    });
    toast.success("Removed empty descriptions.");
    // Auto re-validate against current editor state
    runInternalValidation();
  };

  // NEW: find the first element path that has an empty Description (for XML friendly error hints)
  const findFirstEmptyDescriptionPath = (): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort;
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort];
          const hasDescField = el.description != null;
          const isEmpty =
            typeof el.description === "string"
              ? el.description.trim() === ""
              : !el.description;

          if (hasDescField && isEmpty) {
            return `${submodelId} > ${curChain.join(" > ")}`;
          }

          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain);
            if (found) return found;
          }
        }
        return null;
      };

      const res = walk(submodelData[submodelId] || [], []);
      if (res) return res;
    }
    return null;
  };

  // NEW: detect empty descriptions directly from the last generated XML preview
  const listXmlEmptyDescriptionPaths = (): string[] => {
    if (!lastGeneratedXml) return []
    try {
      const doc = new DOMParser().parseFromString(lastGeneratedXml, "application/xml")
      const parserError = doc.querySelector("parsererror")
      if (parserError) return []

      const paths: string[] = []
      const submodels = Array.from(doc.getElementsByTagName("submodel"))
      submodels.forEach((smEl) => {
        const smIdShort = smEl.querySelector(":scope > idShort")?.textContent?.trim() || "Submodel"

        // Submodel-level description empty
        const smDesc = smEl.querySelector(":scope > description")
        if (smDesc && smDesc.children.length === 0) {
          paths.push(`${smIdShort} > (submodel description)`)
        }

        const smeContainer = smEl.querySelector(":scope > submodelElements")
        const children = smeContainer ? Array.from(smeContainer.children) : []
        children.forEach((sme) => {
          const idShort = sme.querySelector(":scope > idShort")?.textContent?.trim() || "Element"
          const desc = sme.querySelector(":scope > description")
          if (desc && desc.children.length === 0) {
            paths.push(`${smIdShort} > ${idShort}`)
          }
        })
      })

      return paths
    } catch {
      return []
    }
  }

  // NEW: easy one-click fixer for safe changes
  const fixAllSafe = async () => {
    autoFillRequiredValues();
    removeEmptyDescriptionsAll();
    // Re-validate after state updates settle
    setTimeout(() => runInternalValidation(), 0);
  }

  // NEW: pick the next fixable path for the "Fix next" button
  const firstFixPath = (): string | null => {
    // 1) Prioritize internal required/type issues
    if (internalIssues.length > 0) return internalIssues[0];

    // 2) Try friendly XML errors if available and they provide a path
    try {
      const withPath = memoizedFriendlyXmlErrors.find((fe: any) => fe?.path);
      if (withPath?.path) return withPath.path as string;
    } catch {
      // ignore
    }

    // 3) ReferenceElements missing keys
    const refMissing = findReferenceElementsMissingKeys();
    if (Array.isArray(refMissing) && refMissing.length > 0) return refMissing[0];

    // 4) First element with semanticId
    const semantic = findFirstSemanticElementPath();
    if (semantic) return semantic;

    // 5) Required elements with empty values
    const reqEmpty = listRequiredEmptyValuePaths();
    if (Array.isArray(reqEmpty) && reqEmpty.length > 0) return reqEmpty[0];

    // 6) Empty descriptions
    const descEmpty = listEmptyDescriptionPaths();
    if (Array.isArray(descEmpty) && descEmpty.length > 0) return descEmpty[0];

    // 7) XML-derived empty descriptions (if present)
    const descXml = listXmlEmptyDescriptionPaths();
    if (Array.isArray(descXml) && descXml.length > 0) return descXml[0];

    return null;
  }

  // NEW: Friendly XML error formatter (local helper) — now includes line numbers and guessed path
  type FriendlyXmlError = { message: string; hint?: string; path?: string; field?: string; displayField?: string; line?: number };

  function buildFriendlyXmlErrors(errs: (string | { message?: string; loc?: { lineNumber?: number } })[]): FriendlyXmlError[] {
    return (errs || []).map((raw) => {
      const text = typeof raw === "string" ? raw : (raw?.message ? String(raw.message) : String(raw));
      const lower = text.toLowerCase();

      let msg = text;
      let hint: string | undefined;
      let path: string | undefined;
      let field: string | undefined;
      let displayField: string | undefined;
      const line = typeof raw === "object" ? (raw?.loc?.lineNumber ?? undefined) : undefined;

      // Try to resolve exact path by line number against the last generated XML
      if (line && lastGeneratedXml) {
        const resolved = resolvePathFromLine(lastGeneratedXml, line);
        path = resolved || undefined;

        // If index-based resolution failed, fall back to heuristic scanners
        if (!path) {
          const ctx = getContextFromXml(lastGeneratedXml, line);
          path = ctx.path || guessPathFromXmlLine(lastGeneratedXml, line) || undefined;
        }

        msg = `${msg} (Line ${line})`;
      }

      // Derive the field name from the message and build a display field "<path> > <field>"
      field = getFieldFromMessage(text);
      if (field) {
        displayField = path ? `${path} > ${field}` : field;
      }

      // Contextual hints
      if (lower.includes("minlength") && lower.includes("{https://admin-shell.io/aas/3/1}value")) {
        hint = "Provide a non-empty value or remove the empty <value/> for required elements.";
      } else if (lower.includes("displayname") && lower.includes("langStringNameType")) {
        hint = "Add a language-tagged displayName entry (e.g., langStringNameType with language=en).";
      } else if (lower.includes("description") && lower.includes("langStringTextType")) {
        hint = "Descriptions must include langStringTextType; add language and text.";
      } else if (lower.includes("embeddeddataspecifications") && lower.includes("embeddeddataspecification")) {
        hint = "If embeddedDataSpecifications is present, it must contain at least one embeddedDataSpecification.";
      } else if (lower.includes("definition") && lower.includes("langStringDefinitionTypeIec61360")) {
        hint = "IEC61360 definition must include langStringDefinitionTypeIec61360 with language and text.";
      } else if (lower.includes("valuereferencepairs") && lower.includes("valueReferencePair".toLowerCase())) {
        hint = "Value list must include at least one valueReferencePair entry or remove the empty list.";
      } else if (lower.includes("valuetype") || lower.includes("sequence")) {
        hint = "Ensure valueType appears before value for Property / MultiLanguageProperty.";
      } else if (lower.includes("contenttype") && lower.includes("file")) {
        hint = "File elements must include contentType and a valid value (path or URL).";
      } else if (lower.includes("semanticid") && (lower.includes("not expected") || lower.includes("value/valueid"))) {
        hint = "semanticId is not allowed here. In ReferenceElement, use value and valueId instead.";
      } else if (lower.includes("semanticid")) {
        hint = "Use ExternalReference with keys → GlobalReference → value containing the semantic ID.";
      } else if (lower.includes("globalassetid") && lower.includes("keys")) {
        hint = "globalAssetId should be a simple string value, not a reference with keys.";
      } else if (lower.includes("key") && (lower.includes("type attribute") || lower.includes("value attribute") || lower.includes("attribute 'type'") || lower.includes("attribute 'value'"))) {
        hint = "key elements must have type and value as child elements, not as attributes.";
      } else if (lower.includes("embeddeddataspecifications") && lower.includes("not expected")) {
        hint = "embeddedDataSpecifications is not allowed in this element type.";
      }

      return { message: msg, hint, path, field, displayField, line };
    });
  }

  // PERF: Memoize the friendly XML errors to avoid recomputing on every render
  const memoizedFriendlyXmlErrors = useMemo(() => {
    const source = xmlErrorsRaw.length ? xmlErrorsRaw : externalIssues;
    return buildFriendlyXmlErrors(source as any);
  }, [xmlErrorsRaw, externalIssues, lastGeneratedXml]);

  // NEW: guess a model path from an XML line by scanning for nearby idShorts
  function guessPathFromXmlLine(xml: string, lineNumber: number): string | null {
    try {
      const lines = xml.split(/\r?\n/);
      const idx = Math.max(0, Math.min(lines.length - 1, (lineNumber || 1) - 1));
      const start = Math.max(0, idx - 80);
      const end = Math.min(lines.length - 1, idx + 20);
      const windowText = lines.slice(start, end + 1).join("\n");

      const idShortRegex = /<idShort>([^<]+)<\/idShort>/g;
      const submodelRegex = /<submodel>[\s\S]*?<\/submodel>/g;
      const conceptRegex = /<conceptDescription>[\s\S]*?<\/conceptDescription>/g;

      const lastIdShorts: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = idShortRegex.exec(windowText))) {
        lastIdShorts.push(m[1].trim());
      }

      // Try conceptDescription context first
      let conceptMatch: RegExpExecArray | null = null;
      while ((m = conceptRegex.exec(windowText))) {
        conceptMatch = m;
      }
      if (conceptMatch) {
        const idsInConcept: string[] = [];
        const local = conceptMatch[1];
        let cm: RegExpExecArray | null;
        const re = /<idShort>([^<]+)<\/idShort>/g;
        while ((cm = re.exec(local))) idsInConcept.push(cm[1].trim());
        if (idsInConcept.length > 0) {
          return `Concept > ${idsInConcept[idsInConcept.length - 1]}`;
        }
      }

      // Try submodel context
      let submodelMatch: RegExpExecArray | null = null;
      while ((m = submodelRegex.exec(windowText))) {
        submodelMatch = m;
      }
      if (submodelMatch) {
        const idsInSubmodel: string[] = [];
        const local = submodelMatch[1];
        let sm: RegExpExecArray | null;
        const re = /<idShort>([^<]+)<\/idShort>/g;
        while ((sm = re.exec(local))) idsInSubmodel.push(sm[1].trim());
        const submodelIdShort = idsInSubmodel.length > 0 ? idsInSubmodel[0] : null;
        const elementIdShort = idsInSubmodel.length > 1 ? idsInSubmodel[idsInSubmodel.length - 1] : null;
        if (submodelIdShort && elementIdShort && submodelIdShort !== elementIdShort) {
          return `${submodelIdShort} > ${elementIdShort}`;
        }
        if (submodelIdShort) return submodelIdShort;
      }

      // Fallback: last idShort in window
      if (lastIdShorts.length > 0) {
        const leaf = lastIdShorts[lastIdShorts.length - 1];
        const parent = lastIdShorts.length > 1 ? lastIdShorts[lastIdShorts.length - 2] : null;
        if (parent && parent !== leaf) return `${parent} > ${leaf}`;
        return leaf;
      }

      return null;
    } catch {
      return null;
    }
  }

  // Helper: map error message to field name
  function getFieldFromMessage(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.includes("{https://admin-shell.io/aas/3/1}value")) return "value";
    if (lower.includes("displayname")) return "displayName";
    if (lower.includes("{https://admin-shell.io/aas/3/1}description") || lower.includes("langstringtexttype")) return "description";
    if (lower.includes("embeddeddataspecifications")) return "embeddedDataSpecifications";
    if (lower.includes("{https://admin-shell.io/aas/3/1}definition") || lower.includes("langstringdefinitiontypeiec61360")) return "definition";
    if (lower.includes("{https://admin-shell.io/aas/3/1}valuereferencepairs") || lower.includes("valuereferencepair")) return "valueReferencePairs";
    if (lower.includes("globalassetid")) return "globalAssetId";
    if (lower.includes("semanticid")) return "semanticId";
    if (lower.includes("{https://admin-shell.io/aas/3/1}key") || (lower.includes("key") && (lower.includes("type") || lower.includes("value")))) return "key";
    return undefined;
  }

  // Helper: get submodel idShort and nearest element idShort before a given line
  function getContextFromXml(xml: string, lineNumber: number): { submodel?: string; element?: string; path?: string } {
    try {
      const lines = xml.split(/\r?\n/);
      const idx = Math.max(0, Math.min(lines.length - 1, (lineNumber || 1) - 1));
      const upTo = lines.slice(0, idx + 1).join("\n");

      // Find the last submodel idShort before this line
      let submodel: string | undefined;
      const submodelRegex = /<submodel>[\s\S]*?<\/submodel>/gi;
      let smMatch: RegExpExecArray | null;
      while ((smMatch = submodelRegex.exec(upTo))) {
        submodel = (smMatch[1] || "").trim();
      }

      // Find the nearest element idShort before this line (avoid catching the submodel idShort if possible)
      let element: string | undefined;
      // Look for a block with one of the known element tags containing an idShort
      const elementBlockRegex = /<(property|multiLanguageProperty|file|submodelElementCollection|submodelElementList|referenceElement|blob|range|basicEventElement|operation|entity|capability)[^>]*>[\s\S]*?<idShort>([^<]+)<\/idShort>[\s\S]*?<\/\1>/gi;
      let elBlock: RegExpExecArray | null;
      let lastElBlock: string | undefined;
      while ((elBlock = elementBlockRegex.exec(upTo))) {
        lastElBlock = elBlock[2];
      }
      if (lastElBlock) {
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(lastElBlock);
        if (idMatch) element = (idMatch[1] || "").trim();
      } else {
        // Fallback: last idShort anywhere before this line
        let idShortMatch: RegExpExecArray | null;
        const idShortRegex = /<idShort>([^<]+)<\/idShort>/gi;
        let lastId: string | undefined;
        while ((idShortMatch = idShortRegex.exec(upTo))) {
          lastId = (idShortMatch[1] || "").trim();
        }
        // Avoid submodel idShort if it equals
        element = lastId && lastId !== submodel ? lastId : undefined;
      }

      const path = submodel && element ? `${submodel} > ${element}` : (element || submodel);
      return { submodel, element, path };
    } catch {
      return {};
    }
  }

  // NEW: Robust XML indexer to locate Submodel and element blocks with positions
  type XmlBlock = { type: string; idShort: string; start: number; end: number; parent?: string };
  let xmlIndexCache: { xml?: string; submodels: XmlBlock[]; elements: XmlBlock[]; concepts: XmlBlock[] } | null = null;

  function buildXmlIndex(xml: string) {
    if (xmlIndexCache?.xml === xml) return xmlIndexCache;

    const submodels: XmlBlock[] = [];
    const elements: XmlBlock[] = [];
    const concepts: XmlBlock[] = [];

    // Index submodels
    {
      const re = /<submodel>[\s\S]*?<\/submodel>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(block);
        const idShort = (idMatch?.[1] || "Submodel").trim();
        submodels.push({ type: "submodel", idShort, start, end });
      }
    }

    // Index conceptDescriptions
    {
      const re = /<conceptDescription>[\s\S]*?<\/conceptDescription>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(block);
        const idShort = (idMatch?.[1] || "Concept").trim();
        concepts.push({ type: "conceptDescription", idShort, start, end });
      }
    }

    // Index elements and attach parent submodel by containment
    {
      const re = /<(property|multiLanguageProperty|file|submodelElementCollection|submodelElementList|referenceElement|blob|range|basicEventElement|operation|entity|capability)[^>]*>[\s\S]*?<idShort>([^<]+)<\/idShort>[\s\S]*?<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const type = m[1];
        const idShort = (m[2] || "Element").trim();
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;

        // Find parent submodel containing this element
        let parent: string | undefined;
        for (const sm of submodels) {
          if (sm.start <= start && end <= sm.end) {
            parent = sm.idShort;
            break;
          }
        }
        elements.push({ type, idShort, start, end, parent });
      }
    }

    xmlIndexCache = { xml, submodels, elements, concepts };
    return xmlIndexCache;
  }

  // NEW: Resolve exact path from a validator line using the index
  function resolvePathFromLine(xml: string, lineNumber: number): string | null {
    try {
      if (!lineNumber || lineNumber < 1) return null;
      const lines = xml.split(/\r?\n/);
      const offset = lines.slice(0, Math.min(lines.length, lineNumber - 1)).reduce((acc, ln) => acc + ln.length + 1, 0); // +1 for newline
      const idx = buildXmlIndex(xml);

      // Prefer element containment
      const el = idx.elements.find(b => b.start <= offset && offset <= b.end);
      if (el && el.parent) return `${el.parent} > ${el.idShort}`;
      if (el) return el.idShort;

      // Otherwise check submodel containment
      const sm = idx.submodels.find(b => b.start <= offset && offset <= b.end);
      if (sm) return sm.idShort;

      // Or conceptDescription containment
      const cd = idx.concepts.find(b => b.start <= offset && offset <= b.end);
      if (cd) return `Concept > ${cd.idShort}`;

      return null;
    } catch {
      return null;
    }
  }

  // NEW: Auto-fix XML errors in original XML (or current XML preview) by adding/removing minimal content to satisfy schema
  function fixXmlErrors(): string | null {
    console.log("[v0] fixXmlErrors() called");

    // Use original uploaded XML if present; else fall back to latest built XML
    let xml =
      (originalXml && originalXml.trim()) ||
      (lastGeneratedXml && lastGeneratedXml.trim()) ||
      buildCurrentXml();

    console.log(`[v0] Starting XML length: ${xml.length}, source: ${originalXml ? "originalXml" : lastGeneratedXml ? "lastGeneratedXml" : "buildCurrentXml()"}`);

    // Pass 0: Upgrade namespace from 3.0 to 3.1 if needed
    // Handle various namespace declaration patterns
    const ns30Patterns = [
      /https:\/\/admin-shell\.io\/aas\/3\/0/gi,  // Full URL
      /admin-shell\.io\/aas\/3\/0/gi,  // Without https
    ];
    let namespaceUpgraded = false;
    ns30Patterns.forEach(pattern => {
      if (pattern.test(xml)) {
        xml = xml.replace(pattern, (match) => match.replace(/3\/0/, "3/1"));
        namespaceUpgraded = true;
      }
    });
    if (namespaceUpgraded) {
      console.log("[v0] Upgraded namespace from 3.0 to 3.1");
      console.log("[v0] XML namespace check after upgrade:", xml.includes("admin-shell.io/aas/3/0") ? "still has 3.0!" : "successfully upgraded to 3.1");
    }

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      toast.error("Unable to parse XML to apply fixes.");
      return null;
    }

    const ns = doc.documentElement.namespaceURI || ns31;
    const create = (local: string) => doc.createElementNS(ns, local);

    // Helper: get all elements by local name (works with namespaced XML)
    const getByLocalName = (localName: string): Element[] => {
      // Try both namespaced and non-namespaced queries
      const byNS = Array.from(doc.getElementsByTagNameNS(ns, localName));
      const byTag = Array.from(doc.getElementsByTagName(localName));
      // Also query all elements and filter by localName
      const all = Array.from(doc.querySelectorAll("*")).filter(el => el.localName === localName);
      // Combine and dedupe
      const set = new Set([...byNS, ...byTag, ...all]);
      return Array.from(set);
    };

    // Track fixes applied
    let fixCount = 0;

    // Helper: find nearest idShort text for a friendly default
    const findNearestIdShort = (el: Element): string | null => {
      let cur: Element | null = el;
      while (cur) {
        const idShortChild = Array.from(cur.children).find((c) => c.localName === "idShort");
        if (idShortChild && idShortChild.textContent && idShortChild.textContent.trim()) {
          return idShortChild.textContent.trim();
        }
        cur = cur.parentElement;
      }
      return null;
    };

    // Helper: determine if a node is under dataSpecificationIec61360
    const isUnderIec61360 = (el: Element): boolean => {
      let cur: Element | null = el.parentElement;
      while (cur) {
        if (cur.localName === "dataSpecificationIec61360") return true;
        cur = cur.parentElement;
      }
      return false;
    };

    // Helper: get global asset ID from XML
    const getGlobalAssetId = (): string | null => {
      const gai = doc.getElementsByTagName("globalAssetId")[0];
      const txt = gai?.textContent?.trim();
      return txt && txt.length > 0 ? txt : null;
    };

    // Helper: sanitize idShort to match pattern
    const idShortRe = /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9_]$/;
    const sanitizeIdShort = (val: string): string => {
      let s = (val || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
      // ensure starts with a letter
      if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
      // ensure doesn't end with hyphen
      s = s.replace(/-+$/, "");
      // fallback if becomes empty
      if (!s) s = "X1";
      // if still invalid, force safe ending
      if (!idShortRe.test(s)) {
        if (!/[A-Za-z0-9_]$/.test(s)) s = s + "1";
        if (!idShortRe.test(s)) s = "X1";
      }
      return s;
    };

    // Pass 1: fix empty texts and required child blocks
    const all = Array.from(doc.getElementsByTagName("*"));
    all.forEach((el) => {
      const ln = el.localName;

      // 1) Empty <value/>: choose placeholder based on context (kept)
      if (ln === "value" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
        const parent = el.parentElement;
        let placeholder = "—";
        if (parent?.localName === "file") {
          placeholder = "urn:placeholder";
        } else {
          const vtEl = parent?.getElementsByTagName("valueType")?.[0];
          const vtText = vtEl?.textContent?.trim()?.toLowerCase();
          if (vtText === "xs:anyuri") {
            placeholder = "urn:placeholder";
          }
        }
        el.textContent = placeholder;
      }

      // 2) displayName must have langStringNameType (kept)
      if (ln === "displayName" && el.children.length === 0) {
        const block = create("langStringNameType");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = findNearestIdShort(el) || "Display Name";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 3) description must have langStringTextType (kept)
      if (ln === "description" && el.children.length === 0) {
        const block = create("langStringTextType");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = "—";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 4) embeddedDataSpecifications empty -> remove (kept)
      if (ln === "embeddedDataSpecifications" && el.children.length === 0) {
        el.parentElement?.removeChild(el);
      }

      // 5) definition under IEC61360 must contain langStringDefinitionTypeIec61360 (kept)
      if (ln === "definition" && el.children.length === 0 && isUnderIec61360(el)) {
        const block = create("langStringDefinitionTypeIec61360");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = "—";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 6) valueReferencePairs: if empty, remove its parent valueList (schema requires it)
      if (ln === "valueReferencePairs") {
        const hasChildPair = Array.from(el.children).some((c) => c.localName === "valueReferencePair");
        if (!hasChildPair) {
          const parent = el.parentElement;
          if (parent?.localName === "valueList") {
            parent.parentElement?.removeChild(parent);
          } else {
            el.parentElement?.removeChild(el);
          }
        }
      }

      // 7) valueList with no valueReferencePairs -> remove (kept)
      if (ln === "valueList") {
        const hasVrp = Array.from(el.children).some((c) => c.localName === "valueReferencePairs");
        if (!hasVrp) {
          el.parentElement?.removeChild(el);
        }
      }

      // 8) preferredName under IEC61360 must have langStringPreferredNameTypeIec61360
      if (ln === "preferredName" && el.children.length === 0 && isUnderIec61360(el)) {
        const block = create("langStringPreferredNameTypeIec61360");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = findNearestIdShort(el) || "Name";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 9) keys must contain at least one key
      if (ln === "keys") {
        const hasKey = Array.from(el.children).some((c) => c.localName === "key");
        if (!hasKey) {
          const key = create("key");
          const typeEl = create("type");
          const valueEl = create("value");
          // Choose type based on context
          const parentName = el.parentElement?.localName;
          if (parentName === "semanticId" || parentName === "dataSpecification") {
            typeEl.textContent = "GlobalReference";
          } else if (parentName === "reference") {
            // If under submodels > reference, it's likely a Submodel reference
            typeEl.textContent = "Submodel";
          } else {
            typeEl.textContent = "GlobalReference";
          }
          valueEl.textContent = "urn:placeholder";
          key.appendChild(typeEl);
          key.appendChild(valueEl);
          el.appendChild(key);
        }
      }
    });

    // Pass 2: specificAssetIds must contain specificAssetId with name/value
    Array.from(doc.getElementsByTagName("specificAssetIds")).forEach((container) => {
      const hasSpecificAssetId = Array.from(container.children).some((c) => c.localName === "specificAssetId");
      if (!hasSpecificAssetId) {
        const sai = create("specificAssetId");
        const name = create("name");
        const value = create("value");
        const nearest = findNearestIdShort(container) || "asset";
        const gai = getGlobalAssetId() || nearest;
        name.textContent = nearest;
        value.textContent = gai;
        sai.appendChild(name);
        sai.appendChild(value);
        container.appendChild(sai);
        fixCount++;
      }
    });

    // Pass 2b: specificAssetId elements must have a value child
    Array.from(doc.getElementsByTagName("specificAssetId")).forEach((sai) => {
      const children = Array.from(sai.children);
      const valueChild = children.find((c) => c.localName === "value");
      const nameChild = children.find((c) => c.localName === "name");

      if (!valueChild) {
        // Missing value element - add one
        const value = create("value");
        const nearest = findNearestIdShort(sai) || "asset";
        const nameText = nameChild?.textContent?.trim() || nearest;
        const gai = getGlobalAssetId() || nameText;
        value.textContent = gai;
        sai.appendChild(value);
        fixCount++;
        console.log(`[v0] Added missing value to specificAssetId: ${nameText}`);
      } else if (!valueChild.textContent?.trim()) {
        // Empty value element - fill it
        const nearest = findNearestIdShort(sai) || "asset";
        const nameText = nameChild?.textContent?.trim() || nearest;
        const gai = getGlobalAssetId() || nameText;
        valueChild.textContent = gai;
        fixCount++;
        console.log(`[v0] Filled empty value in specificAssetId: ${nameText}`);
      }
    });

    // Pass 2c: globalAssetId must not be empty (minLength 1)
    Array.from(doc.getElementsByTagName("globalAssetId")).forEach((el) => {
      if (!el.textContent?.trim()) {
        const context = findNearestIdShort(el) || "asset";
        el.textContent = `https://example.com/asset/${context}`;
        fixCount++;
      }
    });

    // Pass 2d: version must match pattern (0|[1-9][0-9]*) - set to "1" if empty/invalid
    Array.from(doc.getElementsByTagName("version")).forEach((el) => {
      const val = el.textContent?.trim() || "";
      if (!val || !/^(0|[1-9][0-9]*)$/.test(val)) {
        el.textContent = "1";
        fixCount++;
      }
    });

    // Pass 2e: revision must match pattern (0|[1-9][0-9]*) - set to "0" if empty/invalid
    Array.from(doc.getElementsByTagName("revision")).forEach((el) => {
      const val = el.textContent?.trim() || "";
      if (!val || !/^(0|[1-9][0-9]*)$/.test(val)) {
        el.textContent = "0";
        fixCount++;
      }
    });

    // Pass 2f: unit must not be empty if present - remove if empty
    Array.from(doc.getElementsByTagName("unit")).forEach((el) => {
      if (!el.textContent?.trim()) {
        el.parentElement?.removeChild(el);
        fixCount++;
      }
    });

    // Pass 2g: isCaseOf must have reference child - remove if empty
    Array.from(doc.getElementsByTagName("isCaseOf")).forEach((el) => {
      const hasReference = Array.from(el.children).some((c) => c.localName === "reference");
      if (!hasReference) {
        el.parentElement?.removeChild(el);
        fixCount++;
      }
    });

    // Pass 2h: id elements must not be empty (minLength 1) - skip if under key element
    Array.from(doc.getElementsByTagName("id")).forEach((el) => {
      if (el.parentElement?.localName === "key") return;
      if (!el.textContent?.trim()) {
        const context = findNearestIdShort(el) || "element";
        el.textContent = `https://example.com/aas/${context}`;
        fixCount++;
      }
    });

    // Pass 3: assetType must be non-empty (schema minLength=1)
    Array.from(doc.getElementsByTagName("assetType")).forEach((el) => {
      const txt = el.textContent?.trim() || "";
      if (txt.length === 0) {
        el.textContent = "Product";
      }
    });

    // Pass 4: conceptDescriptions container — remove if empty
    Array.from(doc.getElementsByTagName("conceptDescriptions")).forEach((cds) => {
      const hasAny = Array.from(cds.children).some((c) => c.localName === "conceptDescription");
      if (!hasAny) {
        cds.parentElement?.removeChild(cds);
      }
    });

    // Pass 5: normalize all idShort values to match pattern
    Array.from(doc.getElementsByTagName("idShort")).forEach((idEl) => {
      const raw = idEl.textContent || "";
      const cleaned = sanitizeIdShort(raw);
      idEl.textContent = cleaned;
    });

    // Pass 6: Ensure embeddedDataSpecifications has a minimal valid child if present
    Array.from(doc.getElementsByTagName("embeddedDataSpecifications")).forEach((eds) => {
      const embedded = Array.from(eds.children).filter((c) => c.localName === "embeddedDataSpecification");
      // If container has other content but no embeddedDataSpecification, add one
      if (embedded.length === 0 && eds.children.length > 0) {
        const e = create("embeddedDataSpecification");
        eds.appendChild(e);
        embedded.push(e);
      } else if (embedded.length === 0 && eds.children.length === 0) {
        // already handled earlier (container removed), skip
        return;
      }
      embedded.forEach((e) => {
        let dataSpec = Array.from(e.children).find((c) => c.localName === "dataSpecification");
        if (!dataSpec) {
          dataSpec = create("dataSpecification");
          e.appendChild(dataSpec);
        }
        let keys = Array.from(dataSpec.children).find((c) => c.localName === "keys");
        if (!keys) {
          keys = create("keys");
          dataSpec.appendChild(keys);
        }
        // Ensure at least one key GlobalReference → IEC61360 template
        const hasKey = Array.from(keys.children).some((c) => c.localName === "key");
        if (!hasKey) {
          const key = create("key");
          const typeEl = create("type");
          const valueEl = create("value");
          typeEl.textContent = "GlobalReference";
          valueEl.textContent = "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360";
          key.appendChild(typeEl);
          key.appendChild(valueEl);
          keys.appendChild(key);
        }

        let dsc = Array.from(e.children).find((c) => c.localName === "dataSpecificationContent");
        if (!dsc) {
          dsc = create("dataSpecificationContent");
          e.appendChild(dsc);
        }
        let iec = Array.from(dsc.children).find((c) => c.localName === "dataSpecificationIec61360");
        if (!iec) {
          iec = create("dataSpecificationIec61360");
          dsc.appendChild(iec);
        }
        // Ensure preferredName exists with at least one language entry
        let preferredName = Array.from(iec.children).find((c) => c.localName === "preferredName");
        if (!preferredName) {
          preferredName = create("preferredName");
          iec.appendChild(preferredName);
        }
        const hasLangPref = Array.from(preferredName.children).some((c) => c.localName === "langStringPreferredNameTypeIec61360");
        if (!hasLangPref) {
          const block = create("langStringPreferredNameTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = findNearestIdShort(e) || "Name";
          block.appendChild(language);
          block.appendChild(text);
          preferredName.appendChild(block);
        }
        // If shortName exists but empty, add language block
        let shortName = Array.from(iec.children).find((c) => c.localName === "shortName");
        if (shortName && shortName.children.length === 0) {
          const block = create("langStringShortNameTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = findNearestIdShort(e) || "Short";
          block.appendChild(language);
          block.appendChild(text);
          shortName.appendChild(block);
        }
        // If definition exists but empty, add language block (kept by earlier pass if under IEC61360)
        let definition = Array.from(iec.children).find((c) => c.localName === "definition");
        if (definition && definition.children.length === 0) {
          const block = create("langStringDefinitionTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = "—";
          block.appendChild(language);
          block.appendChild(text);
          definition.appendChild(block);
        }
      });
    });

    // Pass 7: remove empty Operation variable containers (they're optional but cannot be empty)
    ["inputVariables", "outputVariables", "inoutputVariables"].forEach((localName) => {
      Array.from(doc.getElementsByTagName(localName)).forEach((container) => {
        const hasOpVar = Array.from(container.children).some((c) => c.localName === "operationVariable");
        if (!hasOpVar) {
          container.parentElement?.removeChild(container);
        }
      });
    });

    // Pass 8: remove empty submodelElements containers (must contain at least one allowed element if present)
    Array.from(doc.getElementsByTagName("submodelElements")).forEach((container) => {
      const allowed = new Set([
        "relationshipElement",
        "annotatedRelationshipElement",
        "basicEventElement",
        "blob",
        "capability",
        "entity",
        "file",
        "multiLanguageProperty",
        "operation",
        "property",
        "range",
        "referenceElement",
        "submodelElementCollection",
        "submodelElementList"
      ]);
      const hasAny = Array.from(container.children).some((c) => allowed.has(c.localName));
      if (!hasAny) {
        container.parentElement?.removeChild(container);
      }
    });

    // Pass 9: sanitize all <language> values to valid BCP47 tags (fallback to 'en' if invalid)
    Array.from(doc.getElementsByTagName("language")).forEach((langEl) => {
      const raw = (langEl.textContent || "").trim();
      // Simple BCP47 check: starts with 2–8 letters and only allowed subtags
      const isValid = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/.test(raw);
      if (!isValid || raw.length === 0) {
        langEl.textContent = "en";
      }
    });

    // Pass 10: ensure non-empty <text> in any langString* blocks
    Array.from(doc.getElementsByTagName("text")).forEach((textEl) => {
      const parent = textEl.parentElement;
      const isLangString = !!parent && parent.localName.toLowerCase().startsWith("langstring");
      const raw = (textEl.textContent || "").trim();
      if (isLangString && raw.length === 0) {
        textEl.textContent = "—";
      }
    });

    // Pass 11: remove defaultThumbnail if path is empty or missing (schema requires non-empty path)
    Array.from(doc.getElementsByTagName("defaultThumbnail")).forEach((thumbEl) => {
      const pathEl = Array.from(thumbEl.children).find((c) => c.localName === "path");
      const contentEl = Array.from(thumbEl.children).find((c) => c.localName === "contentType");
      const pathTxt = (pathEl?.textContent || "").trim();
      const contentTxt = (contentEl?.textContent || "").trim();
      if (!pathEl || pathTxt.length === 0 || (contentEl && contentTxt.length === 0)) {
        thumbEl.parentElement?.removeChild(thumbEl);
      }
    });

    // Pass 12: For each Property, ensure valueType exists and comes BEFORE any direct <value>; reorder if needed
    Array.from(doc.getElementsByTagName("property")).forEach((prop) => {
      const children = Array.from(prop.children);
      const vtEl = children.find((c) => c.localName === "valueType") as Element | undefined;
      const valueEls = children.filter((c) => c.localName === "value") as Element[];

      // If multiple <value> children, keep the first and remove the extras
      if (valueEls.length > 1) {
        for (let i = 1; i < valueEls.length; i++) {
          prop.removeChild(valueEls[i]);
        }
      }
      const firstValue = valueEls[0];

      // Build a valueType if missing, preferring IEC 61360 dataType, else xs:string
      const ensureValueType = (): Element => {
        // Try IEC 61360 dataType from embeddedDataSpecifications › dataSpecificationContent › dataSpecificationIec61360 › dataType
        let iecType = "";
        const eds = prop.getElementsByTagName("embeddedDataSpecifications")[0];
        if (eds) {
          const dsc = eds.getElementsByTagName("dataSpecificationContent")[0];
          if (dsc) {
            const iec = dsc.getElementsByTagName("dataSpecificationIec61360")[0];
            if (iec) {
              const dt = iec.getElementsByTagName("dataType")[0];
              iecType = dt?.textContent?.trim() || "";
            }
          }
        }
        const vtText = (typeof deriveValueTypeFromIEC === "function" ? (deriveValueTypeFromIEC(iecType) || "xs:string") : "xs:string");
        const el = create("valueType");
        el.textContent = vtText;
        // Insert before the first <value> (or append if no value)
        if (firstValue) {
          prop.insertBefore(el, firstValue);
        } else {
          prop.appendChild(el);
        }
        return el;
      };

      const vt = vtEl || ensureValueType();

      // Ensure order: valueType must be before value
      if (firstValue) {
        const vtIdx = children.indexOf(vt);
        const valIdx = children.indexOf(firstValue);
        if (valIdx !== -1 && vtIdx !== -1 && valIdx < vtIdx) {
          // move value to be right after valueType
          prop.removeChild(firstValue);
          prop.insertBefore(firstValue, vt.nextSibling);
        }
      }
    });

    // Pass 13: For each File, ensure contentType is a valid non-empty MIME (infer from value path or fallback)
    Array.from(doc.getElementsByTagName("file")).forEach((fileEl) => {
      const getChild = (name: string) => Array.from(fileEl.children).find((c) => c.localName === name) as Element | undefined;
      let ctEl = getChild("contentType");
      const valEl = getChild("value");
      const valPath = (valEl?.textContent || "").trim().toLowerCase();

      // Infer MIME from extension
      const ext = (() => {
        if (!valPath) return "";
        const parts = valPath.split("?")[0].split("#")[0].split(".");
        return parts.length > 1 ? parts.pop() || "" : "";
      })();
      const extToMime = (e: string): string | undefined => {
        switch (e) {
          case "png": return "image/png";
          case "jpg":
          case "jpeg": return "image/jpeg";
          case "gif": return "image/gif";
          case "svg": return "image/svg+xml";
          case "pdf": return "application/pdf";
          case "txt": return "text/plain";
          case "json": return "application/json";
          default: return undefined;
        }
      };
      const mimeFromExt = extToMime(ext);
      const isValidMime = (s: string) => /^[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+\/[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+(?:\s*;\s*[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+=(?:[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+|"[^"]*"))*$/.test(s);

      const chosen = mimeFromExt || "application/octet-stream";

      if (!ctEl) {
        ctEl = create("contentType");
        ctEl.textContent = chosen;
        // Insert contentType before value if possible to keep typical order
        if (valEl) fileEl.insertBefore(ctEl, valEl);
        else fileEl.appendChild(ctEl);
      } else {
        const raw = (ctEl.textContent || "").trim();
        if (raw.length === 0 || !isValidMime(raw)) {
          ctEl.textContent = chosen;
        }
      }
    });

    // Pass 14: Ensure valueFormat has non-empty text (schema minLength=1)
    Array.from(doc.getElementsByTagName("valueFormat")).forEach((vfEl) => {
      const txt = (vfEl.textContent || "").trim();
      if (txt.length === 0) {
        vfEl.textContent = "text/plain";
      }
    });

    // Pass 15: Remove empty qualifiers containers (must contain at least one qualifier if present)
    // Use querySelectorAll with local-name check for better namespace handling
    const qualifiersToRemove: Element[] = [];
    let qualifiersFound = 0;
    doc.querySelectorAll("*").forEach((el) => {
      if (el.localName === "qualifiers") {
        qualifiersFound++;
        const children = Array.from(el.children);
        const hasQualifier = children.some((c) => c.localName === "qualifier");
        console.log(`[v0] Pass 15: Found qualifiers element #${qualifiersFound}, children=${children.length}, hasQualifier=${hasQualifier}`);
        if (children.length > 0) {
          console.log(`[v0] Pass 15: qualifiers children localNames:`, children.map(c => c.localName).join(", "));
        }
        if (!hasQualifier) {
          qualifiersToRemove.push(el);
        }
      }
    });
    console.log(`[v0] Pass 15: Found ${qualifiersFound} qualifiers elements, ${qualifiersToRemove.length} to remove`);
    qualifiersToRemove.forEach((el, idx) => {
      console.log(`[v0] Removing empty qualifiers element #${idx + 1}, parent=${el.parentElement?.localName}`);
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    // Pass 16: Remove empty statements containers (Entity element - must contain allowed elements if present)
    const statementsToRemove: Element[] = [];
    const allowedStatementChildren = new Set([
      "relationshipElement", "annotatedRelationshipElement", "basicEventElement",
      "blob", "capability", "entity", "file", "multiLanguageProperty",
      "operation", "property", "range", "referenceElement",
      "submodelElementCollection", "submodelElementList"
    ]);
    doc.querySelectorAll("*").forEach((el) => {
      if (el.localName === "statements") {
        const hasAllowed = Array.from(el.children).some((c) => allowedStatementChildren.has(c.localName));
        if (!hasAllowed) {
          statementsToRemove.push(el);
        }
      }
    });
    statementsToRemove.forEach((el) => {
      console.log("[v0] Removing empty statements element");
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    // Pass 17: Fix value elements in SubmodelElementCollection/SubmodelElementList
    // These should contain child elements, not text content
    const collectionParentTags = new Set(["submodelElementCollection", "submodelElementList"]);
    const allowedValueChildren = new Set([
      "relationshipElement", "annotatedRelationshipElement", "basicEventElement",
      "blob", "capability", "entity", "file", "multiLanguageProperty",
      "operation", "property", "range", "referenceElement",
      "submodelElementCollection", "submodelElementList"
    ]);
    const valuesToRemove: Element[] = [];
    doc.querySelectorAll("*").forEach((parent) => {
      if (collectionParentTags.has(parent.localName)) {
        Array.from(parent.children).forEach((child) => {
          if (child.localName === "value") {
            const hasAllowedChild = Array.from(child.children).some((c) => allowedValueChildren.has(c.localName));
            const hasTextContent = (child.textContent || "").trim().length > 0 && child.children.length === 0;

            if (hasTextContent && !hasAllowedChild) {
              // This value has text content but should have element children - clear it
              console.log("[v0] Clearing text content from collection value element");
              child.textContent = "";
              fixCount++;
            }

            // If value is empty (no children, no meaningful content), mark for removal
            if (child.children.length === 0 && (child.textContent || "").trim().length === 0) {
              valuesToRemove.push(child);
            }
          }
        });
      }
    });
    valuesToRemove.forEach((el) => {
      console.log("[v0] Removing empty value element from collection");
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    // Pass 18: Remove empty extensions containers
    const extensionsToRemove: Element[] = [];
    doc.querySelectorAll("*").forEach((el) => {
      if (el.localName === "extensions") {
        const hasExtension = Array.from(el.children).some((c) => c.localName === "extension");
        if (!hasExtension) {
          extensionsToRemove.push(el);
        }
      }
    });
    extensionsToRemove.forEach((el) => {
      console.log("[v0] Removing empty extensions element");
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    // Pass 19: Remove empty supplementalSemanticIds containers
    const supplementalToRemove: Element[] = [];
    doc.querySelectorAll("*").forEach((el) => {
      if (el.localName === "supplementalSemanticIds") {
        const hasRef = Array.from(el.children).some((c) => c.localName === "reference");
        if (!hasRef) {
          supplementalToRemove.push(el);
        }
      }
    });
    supplementalToRemove.forEach((el) => {
      console.log("[v0] Removing empty supplementalSemanticIds element");
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    // Pass 20: Second pass to catch any remaining empty containers
    const emptyContainersToRemove: Element[] = [];
    const emptyContainerNames = new Set(["qualifiers", "statements", "extensions", "supplementalSemanticIds"]);
    doc.querySelectorAll("*").forEach((el) => {
      if (emptyContainerNames.has(el.localName) && el.children.length === 0) {
        emptyContainersToRemove.push(el);
      }
    });
    emptyContainersToRemove.forEach((el) => {
      console.log(`[v0] Removing remaining empty ${el.localName} element`);
      el.parentElement?.removeChild(el);
      fixCount++;
    });

    let fixed = new XMLSerializer().serializeToString(doc);

    // DEBUG: Log what qualifiers elements look like in the serialized XML
    const qualifiersMatches = fixed.match(/<[^>]*qualifiers[^>]*>[\s\S]*?<\/[^>]*qualifiers>/gi) || [];
    console.log(`[v0] Found ${qualifiersMatches.length} qualifiers elements in serialized XML`);
    if (qualifiersMatches.length > 0) {
      console.log("[v0] Sample qualifiers element:", qualifiersMatches[0]);
    }

    // Post-processing: Use string-based regex to remove empty containers that DOM manipulation missed
    // This is more reliable for namespaced XML
    const emptyContainerPatterns = [
      // Empty qualifiers with any whitespace inside (handles namespace prefixes like aas:qualifiers)
      /<([a-zA-Z0-9_-]+:)?qualifiers[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?qualifiers>/gi,
      /<([a-zA-Z0-9_-]+:)?qualifiers\s*\/>/gi,
      // Empty statements with any whitespace inside
      /<([a-zA-Z0-9_-]+:)?statements[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?statements>/gi,
      /<([a-zA-Z0-9_-]+:)?statements\s*\/>/gi,
      // Empty extensions
      /<([a-zA-Z0-9_-]+:)?extensions[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?extensions>/gi,
      /<([a-zA-Z0-9_-]+:)?extensions\s*\/>/gi,
      // Empty supplementalSemanticIds
      /<([a-zA-Z0-9_-]+:)?supplementalSemanticIds[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?supplementalSemanticIds>/gi,
      /<([a-zA-Z0-9_-]+:)?supplementalSemanticIds\s*\/>/gi,
      // Empty value elements (only whitespace content)
      /<([a-zA-Z0-9_-]+:)?value[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?value>/gi,
      /<([a-zA-Z0-9_-]+:)?value\s*\/>/gi,
    ];

    // DEBUG: Test if our pattern would match the sample element
    if (qualifiersMatches.length > 0) {
      const sample = qualifiersMatches[0]!;
      const testPattern = /<([a-zA-Z0-9_-]+:)?qualifiers[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?qualifiers>/gi;
      const wouldMatch = testPattern.test(sample);
      console.log(`[v0] Test pattern matches sample: ${wouldMatch}`);
      if (!wouldMatch) {
        // Try to understand what's inside the qualifiers
        const innerContent = sample.replace(/<[^>]*qualifiers[^>]*>/gi, '').replace(/<\/[^>]*qualifiers>/gi, '');
        console.log(`[v0] Inner content of qualifiers (length=${innerContent.length}):`, JSON.stringify(innerContent.substring(0, 200)));
      }
    }

    let prevLength = fixed.length;
    let iterations = 0;
    const maxIterations = 10;

    // Keep removing until no more changes (handles nested empties)
    do {
      prevLength = fixed.length;
      emptyContainerPatterns.forEach((pattern, idx) => {
        const before = fixed.length;
        fixed = fixed.replace(pattern, '');
        if (fixed.length < before) {
          const removed = (before - fixed.length);
          console.log(`[v0] String cleanup: removed ${removed} chars with pattern[${idx}]: ${pattern}`);
          fixCount++;
        }
      });
      iterations++;
    } while (fixed.length < prevLength && iterations < maxIterations);

    // Also remove SubmodelElementList/Collection value elements that only contain text (not elements)
    // BUT preserve <value> elements inside <key> elements (they contain semanticId values)
    // Pattern: <value>anything that's not a tag</value> (with optional namespace prefix)
    const valueTextPattern = /<([a-zA-Z0-9_-]+:)?value>([^<]+)<\/([a-zA-Z0-9_-]+:)?value>/g;
    fixed = fixed.replace(valueTextPattern, (match, prefix1, content, prefix2, offset) => {
      // Only remove if the content is just text (no child elements)
      if (content.trim() && !content.includes('<')) {
        // Check if this <value> is inside a <key> element by looking at preceding text
        // Key elements have structure: <key><type>...</type><value>...</value></key>
        const precedingText = fixed.substring(Math.max(0, offset - 200), offset);

        // If preceded by </type> without a closing </key> after it, this value is inside a key
        const lastTypeClose = precedingText.lastIndexOf('</type>');
        const lastKeyClose = precedingText.lastIndexOf('</key>');
        const lastKeyOpen = precedingText.lastIndexOf('<key>');

        // Also check for namespaced versions
        const lastTypeClosed = Math.max(
          precedingText.lastIndexOf('</type>'),
          precedingText.lastIndexOf(':type>')
        );
        const lastKeyClosed = Math.max(
          precedingText.lastIndexOf('</key>'),
          precedingText.lastIndexOf(':key>')
        );
        const lastKeyOpened = Math.max(
          precedingText.lastIndexOf('<key>'),
          precedingText.lastIndexOf(':key>')
        );

        // If we're inside a <key> element (opened more recently than closed, and type just closed)
        if (lastTypeClose > lastKeyClose && lastKeyOpen > lastKeyClose) {
          // This is a valid <value> inside a <key> - preserve it
          console.log(`[v0] Preserving value inside key: "${content.substring(0, 50)}..."`);
          return match;
        }

        // Also preserve if content looks like a semanticId (IRDI, IRI patterns)
        if (content.includes('0173-1#') || content.includes('0112/') || content.includes('http') || content.includes('urn:')) {
          console.log(`[v0] Preserving value with semanticId pattern: "${content.substring(0, 50)}..."`);
          return match;
        }

        console.log(`[v0] Removing value with text-only content: "${content.substring(0, 50)}..."`);
        fixCount++;
        return ''; // Remove the entire value element
      }
      return match;
    });

    const withHeader = fixed.startsWith("<?xml") ? fixed : `<?xml version="1.0" encoding="UTF-8"?>\n${fixed}`;

    // Update editor state to use the fixed XML for next validation/export
    setOriginalXml(withHeader);
    setLastGeneratedXml(withHeader);

    // NEW: also fix model.json in attachments
    fixJsonEnvironment();

    console.log(`[v0] Applied ${fixCount} fixes to XML`);
    console.log(`[v0] Fixed XML has 3.0 namespace: ${withHeader.includes("admin-shell.io/aas/3/0")}`);
    console.log(`[v0] Fixed XML has 3.1 namespace: ${withHeader.includes("admin-shell.io/aas/3/1")}`);
    console.log(`[v0] Fixed XML length: ${withHeader.length}`);
    // Count both prefixed and non-prefixed tags
    console.log(`[v0] Remaining qualifiers tags: ${(withHeader.match(/<([a-zA-Z0-9_-]+:)?qualifiers/g) || []).length}`);
    console.log(`[v0] Remaining statements tags: ${(withHeader.match(/<([a-zA-Z0-9_-]+:)?statements/g) || []).length}`);
    console.log(`[v0] Remaining empty value tags: ${(withHeader.match(/<([a-zA-Z0-9_-]+:)?value[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?value>/g) || []).length}`);
    toast.success(`Applied ${fixCount} fixes. Validating...`);
    return withHeader;
  }

  // ADD: keep an editable attachments state so we can replace model.json
  const [attachmentsState, setAttachmentsState] = useState<Record<string, string> | undefined>(attachments);

  // Helper: base64 encode/decode for JSON data URLs
  function toBase64Utf8(str: string): string {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromBase64Utf8(b64: string): string {
    return decodeURIComponent(escape(atob(b64)));
  }
  function jsonToDataUrl(obj: any): string {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    return "data:application/json;base64," + toBase64Utf8(s);
  }
  function dataUrlToString(dataUrl: string): string {
    const base64 = (dataUrl || "").split(",")[1] || "";
    return fromBase64Utf8(base64);
  }

  // NEW: build XML data URL from string
  function xmlToDataUrl(xml: string): string {
    return "data:text/xml;base64," + toBase64Utf8(xml);
  }

  // Reuse XML idShort sanitizer for JSON
  // UPDATED: align with json-validator.ts pattern (final char must be a letter or digit)
  const idShortPattern = /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]$|^[A-Za-z]$/;
  function sanitizeIdShortJson(val: string): string {
    let s = (val || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
    // ensure starts with a letter
    if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
    // remove trailing underscores/dashes
    s = s.replace(/[_-]+$/, "");
    // fallback if becomes empty
    if (!s) s = "X1";
    // enforce pattern; ensure final char is alphanumeric
    if (!idShortPattern.test(s)) {
      if (!/[A-Za-z0-9]$/.test(s)) s = s + "1";
      if (!idShortPattern.test(s)) s = "X1";
    }
    return s;
  }

  // Walk JSON object and sanitize idShorts; also fill assetType/specificAssetIds
  function fixJsonEnvironment() {
    try {
      const att = attachmentsState || attachments;
      if (!att) return;

      // Find a JSON entry; prefer model.json
      const jsonKey =
        Object.keys(att).find((k) => k.toLowerCase().endsWith("model.json")) ||
        Object.keys(att).find((k) => /\.json$/i.test(k));
      if (!jsonKey) return;

      const rawDataUrl = att[jsonKey];
      // still try to parse even if content-type is text/plain
      const jsonText = dataUrlToString(rawDataUrl);
      const env = JSON.parse(jsonText);

      // 1) Sanitize all idShort fields recursively
      const sanitizeAllIdShorts = (node: any) => {
        if (!node || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node)) {
          if (k === "idShort" && typeof v === "string") {
            (node as any)[k] = sanitizeIdShortJson(v);
          } else if (Array.isArray(v)) {
            v.forEach(sanitizeAllIdShorts);
          } else if (v && typeof v === "object") {
            sanitizeAllIdShorts(v);
          }
        }
      };
      sanitizeAllIdShorts(env);

      // 2) Ensure assetType is non-empty and specificAssetIds has content
      const shells = Array.isArray(env.assetAdministrationShells) ? env.assetAdministrationShells : [];
      if (shells.length > 0) {
        const shell = shells[0];
        if (shell && shell.assetInformation) {
          const ai = shell.assetInformation;
          const atxt = (ai.assetType || "").trim();
          if (atxt.length === 0) {
            ai.assetType = "Product";
          }
          // specificAssetIds: array expected; if missing/empty, add one
          let sai = ai.specificAssetIds;
          if (!Array.isArray(sai)) {
            sai = [];
          }
          if (sai.length === 0) {
            ai.specificAssetIds = [
              {
                name: sanitizeIdShortJson(shell.idShort || "asset"),
                value: ai.globalAssetId || sanitizeIdShortJson(shell.idShort || "asset"),
              },
            ];
          } else {
            ai.specificAssetIds = sai;
          }
        }
      }

      // Build updated data URL and store in attachments state
      const fixedDataUrl = jsonToDataUrl(env);
      const next = { ...(attachmentsState || attachments) };
      next[jsonKey] = fixedDataUrl;
      setAttachmentsState(next);
    } catch (err) {
      console.warn("[v0] Fix JSON failed:", err);
    }
  }

  // NEW: find an attachment key by filename (case-insensitive)
  function findAttachmentKeyByBasename(att: Record<string, string> | undefined, nameCandidates: string[]): string | undefined {
    if (!att) return undefined;
    const keys = Object.keys(att);
    const lcCandidates = nameCandidates.map((n) => n.toLowerCase());
    for (const key of keys) {
      const base = key.split("/").pop() || key;
      const lcBase = base.toLowerCase();
      if (lcCandidates.includes(lcBase)) return key;
    }
    // fallback: check exact endsWith snippet
    for (const key of keys) {
      const lcKey = key.toLowerCase();
      for (const cand of lcCandidates) {
        if (lcKey.endsWith("/" + cand) || lcKey.endsWith(cand)) return key;
      }
    }
    return undefined;
  }

  // Fix value type mismatches by changing valueType to xs:string when value doesn't match
  const fixValueTypeMismatches = (): number => {
    let fixCount = 0;

    const fixElements = (elements: SubmodelElement[]): SubmodelElement[] => {
      return elements.map(element => {
        const updated = { ...element };

        // Check Property elements for value type mismatches
        if (element.modelType === "Property" && typeof element.value === 'string' && element.value.trim() !== '') {
          const vtNorm = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType);
          if (vtNorm && !isValidValueForXsdType(vtNorm, element.value)) {
            // Value doesn't match declared type - change to xs:string
            console.log(`[v0] Fixing valueType mismatch: ${element.idShort} "${element.value}" was ${vtNorm}, changing to xs:string`);
            updated.valueType = 'xs:string';
            // Also clear IEC dataType if it was causing integer/decimal type
            if (element.dataType && ['INTEGER_MEASURE', 'INTEGER_COUNT', 'INTEGER_CURRENCY', 'REAL_MEASURE', 'REAL_COUNT', 'REAL_CURRENCY'].includes(element.dataType.toUpperCase())) {
              updated.dataType = 'STRING';
            }
            fixCount++;
          }
        }

        // Recursively fix children
        if (element.children && element.children.length > 0) {
          updated.children = fixElements(element.children);
        }

        return updated;
      });
    };

    // Fix all submodels
    const newSubmodelData: Record<string, SubmodelElement[]> = {};
    Object.entries(submodelData).forEach(([smId, elements]) => {
      newSubmodelData[smId] = fixElements(elements);
    });

    if (fixCount > 0) {
      setSubmodelData(newSubmodelData);
      toast.info(`Fixed ${fixCount} value type mismatch${fixCount !== 1 ? 'es' : ''} (changed to xs:string)`);
    }

    return fixCount;
  };

  // ADD: click handler for the Fix button that fixes then validates once
  const handleFixClick = async () => {
    if (isFixing || validationBusy) return;
    setIsFixing(true);
    console.log("[v0] Fix button clicked");
    try {
      // First fix value type mismatches in the in-memory data
      const valueTypeFixCount = fixValueTypeMismatches();

      // Then fix XML structure issues
      const fixedXml = fixXmlErrors();

      // Validate with the fixed data
      await runInternalValidation(fixedXml || undefined, { openDialog: true });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Beautiful Gradient Header */}
      <div className="relative bg-gradient-to-br from-[#61caf3] via-[#4db6e6] to-[#3a9fd4] px-6 py-5">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <button
                onClick={() => confirmNavigation(onBack)}
                className="p-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-all"
                title={hasUnsavedChanges ? "Back to Home (unsaved changes)" : "Back to Home"}
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Edit AAS: {activeIdShort}
                  </h2>
                </div>
                <p className="text-white/80 pl-12 text-sm">
                  Fill in the values for your Asset Administration Shell
                  <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-100 rounded text-xs">* = Required</span>
                </p>
              </div>
            </div>
            {/* AAS Info inline grid - glassmorphism cards */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* IdShort */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wide mb-1.5">IdShort</div>
                <div className="flex items-center gap-2">
                  <input
                    value={activeIdShort || ""}
                    onChange={(e) => setAASFieldValue('idShort', e.target.value)}
                    className={cn(
                      "flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-all",
                      editMode
                        ? "bg-white text-gray-900 border-2 border-transparent focus:border-white/50 focus:outline-none"
                        : "bg-white/20 text-white border border-white/20 cursor-not-allowed"
                    )}
                  />
                  <button
                    onClick={() => copyText('IdShort', activeIdShort)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    title="Copy IdShort"
                  >
                    <Copy className="w-4 h-4 text-white/70" />
                  </button>
                </div>
              </div>
              {/* ID */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wide mb-1.5">ID</div>
                <div className="flex items-center gap-2">
                  <input
                    value={activeId || ""}
                    onChange={(e) => setAASFieldValue('id', e.target.value)}
                    className={cn(
                      "flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-all",
                      editMode
                        ? "bg-white text-gray-900 border-2 border-transparent focus:border-white/50 focus:outline-none"
                        : "bg-white/20 text-white border border-white/20 cursor-not-allowed"
                    )}
                  />
                  <button
                    onClick={() => copyText('ID', activeId)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    title="Copy ID"
                  >
                    <Copy className="w-4 h-4 text-white/70" />
                  </button>
                </div>
              </div>
              {/* Asset Kind */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wide mb-1.5">Asset Kind</div>
                <div className="flex items-center gap-2">
                  <input
                    value={activeAssetKind || ""}
                    onChange={(e) => setAASFieldValue('assetKind', e.target.value)}
                    className={cn(
                      "flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-all",
                      editMode
                        ? "bg-white text-gray-900 border-2 border-transparent focus:border-white/50 focus:outline-none"
                        : "bg-white/20 text-white border border-white/20 cursor-not-allowed"
                    )}
                  />
                  <button
                    onClick={() => copyText('Asset Kind', activeAssetKind)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    title="Copy Asset Kind"
                  >
                    <Copy className="w-4 h-4 text-white/70" />
                  </button>
                </div>
              </div>
              {/* Global Asset ID */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wide mb-1.5">Global Asset ID</div>
                <div className="flex items-center gap-2">
                  <input
                    value={activeGlobalAssetId || ""}
                    onChange={(e) => setAASFieldValue('globalAssetId', e.target.value)}
                    className={cn(
                      "flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-all",
                      editMode
                        ? "bg-white text-gray-900 border-2 border-transparent focus:border-white/50 focus:outline-none"
                        : "bg-white/20 text-white border border-white/20 cursor-not-allowed"
                    )}
                  />
                  <button
                    onClick={() => copyText('Global Asset ID', activeGlobalAssetId)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    title="Copy Global Asset ID"
                  >
                    <Copy className="w-4 h-4 text-white/70" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Status indicators row */}
            <div className="flex items-center gap-3">
              {hasUnsavedChanges && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-100 rounded-full text-xs font-medium">
                        <Save className="w-3 h-3" />
                        Unsaved
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>You have unsaved changes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {hasValidated && validationAlerts.length === 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-100 rounded-full text-xs font-medium">
                  <CheckCircle className="w-3 h-3" />
                  Valid
                </span>
              )}
              {hasValidated && validationAlerts.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-100 rounded-full text-xs font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {validationAlerts.length} issues
                </span>
              )}
              {validationBusy && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-full text-xs font-medium">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Validating...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
               <button
                 onClick={() => {
                   setValidationDialogDismissed(false);
                   runInternalValidation(undefined, { openDialog: true });
                 }}
                 disabled={validationBusy}
                 className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-white text-[#3a9fd4] hover:bg-white/90 shadow-lg transition-all duration-200 disabled:opacity-50"
               >
                 {validationBusy ? "Validating..." : "Validate"}
               </button>
               <button
                onClick={openPdfDialog}
                disabled={downloadingPdfs}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/30 shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
                title="Download all PDFs in this model"
              >
                {downloadingPdfs ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    PDFs
                  </>
                )}
              </button>
               <button
                 onClick={generateFinalAAS}
                 disabled={isGenerating}
                 className={cn(
                   "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200",
                   !isGenerating
                     ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02]"
                     : "bg-white/20 text-white/50 cursor-not-allowed"
                 )}
               >
                 {isGenerating ? (
                   <>
                     <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                     Exporting...
                   </>
                 ) : (
                   <>
                     <Download className="w-4 h-4" />
                     Export AAS
                   </>
                 )}
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - AAS Shells with nested Submodels */}
        <div className="w-72 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gradient-to-b from-[#61caf3]/5 to-[#61caf3]/10">
          <div className="p-4 space-y-3">
            {/* Thumbnail */}
            <div className="mb-2">
              {thumbnail ? (
                <div className="relative group">
                  <div className="w-full h-[100px] rounded-xl border-2 border-[#61caf3] shadow-lg shadow-[#61caf3]/10 overflow-hidden flex items-center justify-center bg-white">
                    <img
                      src={thumbnail || "/placeholder.svg"}
                      alt="AAS Thumbnail"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => setThumbnail(null)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all shadow-lg"
                    title="Remove thumbnail"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    className="hidden"
                  />
                  <div className="w-full h-[80px] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#61caf3] flex flex-col items-center justify-center text-gray-400 hover:text-[#61caf3] bg-white dark:bg-gray-800/50 transition-all hover:shadow-lg hover:shadow-[#61caf3]/10">
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-medium">Upload thumbnail</span>
                  </div>
                </label>
              )}
            </div>

            {/* AAS Shells */}
            {(aasConfig.shells && aasConfig.shells.length > 0 ? aasConfig.shells : [
              { idShort: aasConfig.idShort, id: aasConfig.id, assetKind: aasConfig.assetKind, globalAssetId: aasConfig.globalAssetId, submodelIds: aasConfig.selectedSubmodels.map(sm => sm.submodelId || sm.idShort) }
            ]).map((shell, shellIdx) => {
              const isShellSelected = selectedShellIndex === shellIdx
              const shellSubs = aasConfig.selectedSubmodels.filter(sm => sm.submodelId ? shell.submodelIds.includes(sm.submodelId) : shell.submodelIds.includes(sm.idShort))

              return (
                <div key={shell.id || shellIdx} className="w-full">
                  {/* Shell header */}
                  <button
                    onClick={() => {
                      if (isShellSelected) {
                        // Toggle collapse
                        setSelectedShellIndex(null)
                      } else {
                        setSelectedShellIndex(shellIdx)
                        // Auto-select first submodel if switching shells
                        if (shellSubs.length > 0) {
                          setSelectedSubmodel(shellSubs[0])
                          setSelectedElement(null)
                          setExpandedNodes(new Set())
                        }
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left border-2",
                      isShellSelected
                        ? "border-[#61caf3] bg-white dark:bg-gray-800 shadow-md shadow-[#61caf3]/15"
                        : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-[#61caf3]/50"
                    )}
                    title={shell.id}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white",
                      isShellSelected
                        ? "bg-gradient-to-br from-[#61caf3] to-[#3a9fd4]"
                        : "bg-gray-300 dark:bg-gray-600"
                    )}>
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-xs font-semibold truncate",
                        isShellSelected ? "text-[#3a9fd4]" : "text-gray-600 dark:text-gray-400"
                      )}>
                        {shell.idShort || `AAS ${shellIdx + 1}`}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {shellSubs.length} submodel{shellSubs.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "w-3.5 h-3.5 shrink-0 transition-transform",
                      isShellSelected ? "rotate-90 text-[#61caf3]" : "text-gray-400"
                    )} />
                  </button>

                  {/* Nested submodels */}
                  {isShellSelected && (
                    <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 border-[#61caf3]/20 pl-3 pb-1">
                      {shellSubs.map((sm, smIdx) => {
                        const elements = submodelData[sm.idShort] || []
                        const isSmSelected = selectedSubmodel?.idShort === sm.idShort
                        return (
                          <div
                            key={smIdx}
                            className={cn(
                              "px-3 py-2 rounded-lg cursor-pointer transition-all relative group",
                              isSmSelected
                                ? "bg-[#61caf3]/10 border border-[#61caf3]/30"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent"
                            )}
                            onClick={() => {
                              setSelectedSubmodel(sm)
                              setSelectedElement(null)
                              setExpandedNodes(new Set())
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                removeSubmodel(sm.idShort)
                              }}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                              title="Remove submodel"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white",
                                isSmSelected
                                  ? "bg-[#61caf3]"
                                  : "bg-gray-300 dark:bg-gray-600"
                              )}>
                                <FileText className="w-3 h-3" />
                              </div>
                              <div className="min-w-0">
                                <div className={cn(
                                  "text-xs font-medium truncate",
                                  isSmSelected ? "text-[#3a9fd4]" : "text-gray-600 dark:text-gray-400"
                                )} title={sm.idShort}>
                                  {sm.idShort}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {elements.length} elements
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {/* Add Submodel Button */}
                      <button
                        onClick={() => {
                          loadTemplates()
                          setShowAddSubmodel(true)
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-dashed border-[#61caf3]/40 hover:border-[#61caf3] hover:bg-[#61caf3]/5 transition-all flex items-center gap-2 group"
                      >
                        <div className="w-6 h-6 rounded-md bg-[#61caf3]/15 group-hover:bg-[#61caf3]/25 flex items-center justify-center transition-colors">
                          <Plus className="w-3 h-3 text-[#61caf3]" />
                        </div>
                        <span className="text-[10px] text-[#61caf3] font-semibold">Add Submodel</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Middle Panel - Tree Structure */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900">
          <div className="p-5">

            {/* IMPROVED: Validation Summary and Quick Actions - only show when editing existing files */}
            {sourceXml && (validationAlerts.length > 0 || internalIssues.length > 0 || externalIssues.length > 0) && (
              <div className="mb-5 space-y-3">
                {/* Quick Actions Bar */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {validationAlerts.filter(a => a.type === 'error').length > 0 && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {validationAlerts.filter(a => a.type === 'error').length} errors
                        </span>
                      )}
                      {validationAlerts.filter(a => a.type === 'warning').length > 0 && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {validationAlerts.filter(a => a.type === 'warning').length} warnings
                        </span>
                      )}
                    </div>
                    {countFixableAlerts(validationAlerts) > 0 && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {countFixableAlerts(validationAlerts)} can be auto-fixed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setValidationDialogDismissed(false);
                        setValidationDialogOpen(true);
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-[#61caf3] hover:text-[#3a9fd4] transition-all flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      View All
                    </button>
                    <button
                      onClick={handleFixClick}
                      disabled={isFixing || validationBusy}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white hover:shadow-lg hover:shadow-[#61caf3]/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Wrench className="w-4 h-4" />
                      {isFixing ? "Fixing..." : "Auto-Fix"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ADD: Validation Panels */}
            {(internalIssues.length > 0) && (
              <div className="mb-4">
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">Missing Required Fields</span>
                      <Badge variant="destructive" className="ml-1">{internalIssues.length}</Badge>
                    </div>
                    <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-x border-b border-red-200 dark:border-red-700 rounded-b-lg p-3 overflow-hidden">
                    <ScrollArea className="h-48 max-h-48">
                      <ul className="space-y-2 text-sm">
                        {internalIssues.map((msg, idx) => (
                          <li key={idx} className="flex items-start justify-between gap-3 p-2 rounded bg-white dark:bg-gray-900 border border-red-200 dark:border-red-700">
                            <div className="text-red-800 dark:text-red-200">
                              <span className="break-words">{msg}</span>
                              <p className="text-xs text-red-600/70 dark:text-red-300/70 mt-1">
                                This field is required for a valid AAS model
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => goToIssuePath(msg)}
                              className="shrink-0 h-7 px-2 text-xs border border-red-300 dark:border-red-600 hover:bg-red-100 dark:hover:bg-red-800/40"
                            >
                              Go to
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {(externalIssues.length > 0) && (
              <div className="mb-4">
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">XML Schema Issues</span>
                      <Badge variant="outline" className="ml-1 border-amber-500 text-amber-600">{xmlErrorsRaw.length || externalIssues.length}</Badge>
                    </div>
                    <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-x border-b border-amber-200 dark:border-amber-700 rounded-b-lg p-3 overflow-hidden">
                    <ScrollArea className="h-64 max-h-64 overflow-y-auto">
                      <ul className="space-y-2 text-sm">
                        {memoizedFriendlyXmlErrors.map((fe, idx) => (
                          <li key={idx} className="flex items-start justify-between gap-3 p-2 rounded bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700">
                            <div className="text-amber-800 dark:text-amber-200 flex-1">
                              <div className="font-medium text-sm">{fe.message}</div>
                              {fe.field && (
                                <div className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1 flex items-center gap-1">
                                  <span className="font-medium">Field:</span> {fe.displayField ?? fe.field}
                                </div>
                              )}
                              {fe.hint && (
                                <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1 p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded border-l-2 border-amber-400">
                                  <Info className="w-3 h-3 inline mr-1" />
                                  {fe.hint}
                                </div>
                              )}
                              {fe.path && (
                                <div className="text-[11px] text-gray-500 mt-1 font-mono">
                                  Path: {fe.path}
                                </div>
                              )}
                            </div>
                            {fe.path ? (
                              <button
                                onClick={() => goToIssuePath(fe.path!)}
                                className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-yellow-300 dark:border-yellow-600 rounded hover:bg-yellow-100 dark:hover:bg-yellow-800/40"
                              >
                                Go to
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {selectedSubmodel ? (
              <>
                {/* Submodel Header */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-[#61caf3] to-[#3a9fd4] rounded-xl shadow-lg shadow-[#61caf3]/20">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{selectedSubmodel.idShort}</h3>
                      <span className="text-xs text-gray-500">Submodel</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-[#61caf3]/10 text-[#3a9fd4] text-sm font-semibold rounded-full">
                      {submodelData[selectedSubmodel.idShort]?.length || 0} elements
                    </span>
                    {editMode && (
                      <button
                        onClick={() => openAddElementDialog(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white text-sm font-semibold rounded-full hover:shadow-lg hover:shadow-[#61caf3]/30 transition-all"
                        title="Add new element to this submodel"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                </div>

                {/* Search and Tree Controls */}
                <div className="flex items-center gap-2 mb-4">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      ref={(el) => { if (treeSearchFocused && el) { el.focus(); setTreeSearchFocused(false); } }}
                      value={treeSearchInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTreeSearchInput(val);
                        if (treeSearchDebounceRef.current) clearTimeout(treeSearchDebounceRef.current);
                        treeSearchDebounceRef.current = setTimeout(() => setTreeSearchQuery(val), 150);
                      }}
                      placeholder="Search elements... (Ctrl+F)"
                      className="pl-10 h-9 text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    {treeSearchInput && (
                      <button
                        onClick={() => { setTreeSearchInput(""); setTreeSearchQuery(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Expand/Collapse All */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={expandAll}
                          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          aria-label="Expand all"
                        >
                          <ChevronsDownUp className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Expand all</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={collapseAll}
                          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          aria-label="Collapse all"
                        >
                          <ChevronsUpDown className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Collapse all</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Breadcrumb Navigation */}
                {selectedElement && selectedElementPath.length > 0 && (
                  <div className="flex items-center gap-1 mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm overflow-x-auto">
                    <button
                      onClick={() => { setSelectedElement(null); setSelectedElementPath([]); }}
                      className="flex items-center gap-1 text-gray-500 hover:text-[#61caf3] transition-colors shrink-0"
                    >
                      <Home className="w-3.5 h-3.5" />
                    </button>
                    {selectedElementPath.map((segment, idx) => (
                      <div key={idx} className="flex items-center gap-1 shrink-0">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        <button
                          onClick={() => {
                            // Navigate to this level in the tree
                            const pathToHere = selectedElementPath.slice(0, idx + 1);
                            // Find and select this element
                            let current: SubmodelElement | null = null;
                            let elements = submodelData[selectedSubmodel.idShort] || [];
                            for (const seg of pathToHere) {
                              current = elements.find(e => e.idShort === seg) || null;
                              if (current?.children) elements = current.children;
                            }
                            if (current) {
                              setSelectedElement(current);
                              setSelectedElementPath(pathToHere);
                            }
                          }}
                          className={cn(
                            "px-1.5 py-0.5 rounded transition-colors",
                            idx === selectedElementPath.length - 1
                              ? "font-semibold text-[#61caf3] bg-[#61caf3]/10"
                              : "text-gray-600 dark:text-gray-400 hover:text-[#61caf3] hover:bg-[#61caf3]/5"
                          )}
                        >
                          {segment}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search Results Info */}
                {treeSearchQuery && (
                  <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                    {filteredElements.length === 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">No elements match "{treeSearchQuery}"</span>
                    ) : (
                      <span>Showing {filteredElements.length} matching element{filteredElements.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                )}

                {/* Tree Nodes */}
                {(() => {
                  const zc = { value: 0 }
                  return (treeSearchQuery ? filteredElements : submodelData[selectedSubmodel.idShort])?.map((element, idx) =>
                    renderTreeNode(element, 0, [element.idShort], idx, submodelData[selectedSubmodel.idShort], zc)
                  )
                })()}
                {/* Drop zone for moving elements to root level */}
                {draggedItem && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      // Only show if dragged item is not at root level
                      if (draggedItem.path.length > 1) {
                        setDragOverContainer('__root__')
                      }
                    }}
                    onDragLeave={() => setDragOverContainer(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (!draggedItem || !selectedSubmodel) return
                      if (draggedItem.path.length > 1) {
                        // Move to root level
                        moveElement(selectedSubmodel.idShort, draggedItem.path, [])
                      }
                      setDraggedItem(null)
                      setDragOverItem(null)
                      setDragOverContainer(null)
                    }}
                    className={cn(
                      "mt-2 p-3 border-2 border-dashed rounded-xl text-center text-sm transition-all",
                      dragOverContainer === '__root__'
                        ? "border-[#61caf3] bg-[#61caf3]/10 text-[#3a9fd4]"
                        : "border-gray-300 dark:border-gray-600 text-gray-400"
                    )}
                  >
                    Drop here to move to root level
                  </div>
                )}
                {/* Add Element at bottom of tree */}
                {editMode && (submodelData[selectedSubmodel.idShort]?.length || 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#61caf3]/10 flex items-center justify-center mb-4">
                      <Plus className="w-8 h-8 text-[#61caf3]" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium mb-4">No elements yet</p>
                    <button
                      onClick={() => openAddElementDialog(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-[#61caf3]/30 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      Add First Element
                    </button>
                  </div>
                ) : editMode && (
                  <button
                    onClick={() => openAddElementDialog(null)}
                    className="flex items-center gap-2 px-3 py-2 mt-2 text-sm text-[#61caf3] hover:bg-[#61caf3]/10 rounded-lg transition-colors w-full"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add element</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#61caf3]/10 flex items-center justify-center mb-4">
                  <Package className="w-8 h-8 text-[#61caf3]" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Select a submodel to view its structure</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Choose from the sidebar on the left</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Editable Fields (locked when Edit is off) */}
        <div className="w-96 overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-900/50 border-l border-gray-200 dark:border-gray-700">
          {renderEditableDetails()}
        </div>
      </div>

      {/* Submodel selection dialog - Beautiful styled */}
      {showAddSubmodel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[650px] max-h-[650px] flex flex-col overflow-hidden border-0">
            {/* Gradient Header */}
            <div className="relative bg-gradient-to-br from-[#61caf3] via-[#4db6e6] to-[#3a9fd4] px-6 py-5">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Add Submodel Template</h3>
                    <p className="text-white/70 text-sm">Choose from IDTA standard templates</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddSubmodel(false)
                    setSearchQuery("")
                  }}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templateSearchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-white focus:outline-none focus:border-[#61caf3] focus:ring-4 focus:ring-[#61caf3]/20 transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Template List */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* ── Built-in IDTA Templates (local, no network) ── */}
              {(() => {
                const filteredLocal = SUBMODEL_TEMPLATES.filter(t =>
                  !templateSearchQuery ||
                  t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                  t.idtaSpec.toLowerCase().includes(templateSearchQuery.toLowerCase())
                )
                if (filteredLocal.length === 0) return null
                return (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Built-in</span>
                      <span className="flex-1 h-px bg-emerald-200 dark:bg-emerald-800" />
                      <span className="text-[10px] text-gray-400">No network required</span>
                    </div>
                    <div className="grid gap-2">
                      {filteredLocal.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addLocalTemplate(t)}
                          className="w-full p-3 text-left rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:border-emerald-400 hover:shadow-md transition-all duration-200 group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate">{t.name}</span>
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-[10px] rounded-full shrink-0">{t.idtaSpec}</span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.description}</p>
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">v{t.version}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ── GitHub / IDTA Remote Templates ── */}
              {!templateSearchQuery && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">From IDTA GitHub</span>
                  <span className="flex-1 h-px bg-blue-200 dark:bg-blue-800" />
                </div>
              )}
              {loadingTemplates ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-[#61caf3]/20" />
                    <div className="w-12 h-12 rounded-full border-4 border-[#61caf3] border-t-transparent animate-spin absolute inset-0" />
                  </div>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading templates from IDTA...</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">No templates found matching "{templateSearchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-2 text-sm text-[#61caf3] hover:underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        addSubmodel(template)
                        setSearchQuery("")
                      }}
                      className="w-full p-4 text-left rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-[#61caf3] hover:shadow-lg hover:shadow-[#61caf3]/10 transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-[#3a9fd4] transition-colors">
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
                        <div className="p-2.5 bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0">
                          <Plus className="w-5 h-5" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Element Dialog */}
      {showAddElementDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[550px] max-h-[90vh] flex flex-col overflow-hidden border-0">
            {/* Gradient Header */}
            <div className="relative bg-gradient-to-br from-[#61caf3] via-[#4db6e6] to-[#3a9fd4] px-6 py-5">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {addElementStep === 2 && (
                    <button
                      onClick={() => setAddElementStep(1)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                  )}
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {addElementStep === 1 ? "Select Element Type" : "Element Details"}
                    </h3>
                    <p className="text-white/70 text-sm">
                      {addElementStep === 1
                        ? "Step 1 of 2 — Choose the type of element to add"
                        : `Step 2 of 2 — Configure your ${ALL_ELEMENT_TYPES.find(t => t.value === newElementType)?.label || newElementType}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddElementDialog(false)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Step 1: Element Type Selection */}
            {addElementStep === 1 && (
              <>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ELEMENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setNewElementType(type.value as SubmodelElementModelType | "CapabilityName");
                          setAddElementStep(2);
                        }}
                        className={cn(
                          "text-left p-3 rounded-xl border-2 transition-all duration-200",
                          "border-gray-200 dark:border-gray-700 hover:border-[#61caf3] hover:bg-gradient-to-br hover:from-cyan-50 hover:to-sky-50 dark:hover:from-cyan-900/20 dark:hover:to-sky-900/20"
                        )}
                      >
                        <div className="font-medium text-sm text-gray-900 dark:text-white">{type.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{type.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900/80 dark:to-gray-800/50 border-t border-gray-200/50 dark:border-gray-700/50 flex justify-between items-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {addElementParentPath && addElementParentPath.length > 0
                      ? `Adding to: ${addElementParentPath.join(" > ")}`
                      : `Adding to: ${selectedSubmodel?.idShort || "Submodel"} (root)`}
                  </p>
                  <button
                    onClick={() => setShowAddElementDialog(false)}
                    className="px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Element Details */}
            {addElementStep === 2 && (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Selected type badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Type:</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-900/30 dark:to-sky-900/30 border border-[#61caf3]/30 text-sm font-semibold text-[#2a8ab5] dark:text-[#61caf3]">
                      {ALL_ELEMENT_TYPES.find(t => t.value === newElementType)?.label || newElementType}
                    </span>
                    <button
                      onClick={() => setAddElementStep(1)}
                      className="text-xs text-[#61caf3] hover:text-[#4db6e6] underline underline-offset-2 ml-1"
                    >
                      Change
                    </button>
                  </div>

                  {/* idShort */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                      idShort
                      <span className="text-red-400 text-xs">required</span>
                    </label>
                    <input
                      type="text"
                      value={newElementIdShort}
                      onChange={(e) => setNewElementIdShort(e.target.value)}
                      placeholder="e.g., MyProperty, ContactInfo"
                      autoFocus
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white transition-all duration-200",
                        "bg-white dark:bg-gray-800/50 border-2",
                        "focus:outline-none focus:ring-4 focus:ring-[#61caf3]/20",
                        "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                        newElementIdShort && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newElementIdShort)
                          ? "border-red-400 focus:border-red-400"
                          : "border-gray-200 dark:border-gray-700 focus:border-[#61caf3]"
                      )}
                    />
                    {newElementIdShort && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newElementIdShort) && (
                      <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Must start with a letter, contain only letters, digits, &quot;_&quot; or &quot;-&quot;
                      </p>
                    )}
                  </div>

                  {/* Cardinality */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                      Cardinality
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["One", "ZeroToOne", "ZeroToMany", "OneToMany"] as const).map((card) => (
                        <button
                          key={card}
                          type="button"
                          onClick={() => setNewElementCardinality(card)}
                          className={cn(
                            "px-3 py-2 rounded-xl font-medium text-sm transition-all duration-200 border-2",
                            newElementCardinality === card
                              ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white border-transparent shadow-lg shadow-[#61caf3]/25"
                              : "bg-white dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#61caf3]/50"
                          )}
                        >
                          {card === "One" ? "1" : card === "ZeroToOne" ? "0..1" : card === "ZeroToMany" ? "0..*" : "1..*"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ValueType (for Property and Range) */}
                  {(newElementType === "Property" || newElementType === "Range") && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                        Value Type
                      </label>
                      <select
                        value={newElementValueType}
                        onChange={(e) => setNewElementValueType(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-white focus:outline-none focus:border-[#61caf3] focus:ring-4 focus:ring-[#61caf3]/20"
                      >
                        {XSD_VALUE_TYPES.map((vt) => (
                          <option key={vt} value={vt}>{vt}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Entity Type (for Entity) */}
                  {newElementType === "Entity" && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#61caf3]" />
                        Entity Type
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["CoManagedEntity", "SelfManagedEntity"] as const).map((et) => (
                          <button
                            key={et}
                            type="button"
                            onClick={() => setNewElementEntityType(et)}
                            className={cn(
                              "px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 border-2",
                              newElementEntityType === et
                                ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white border-transparent shadow-lg shadow-[#61caf3]/25"
                                : "bg-white dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#61caf3]/50"
                            )}
                          >
                            {et === "CoManagedEntity" ? "Co-Managed" : "Self-Managed"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Semantic ID (optional) — with eCLASS browser */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Semantic ID
                      <span className="text-gray-400 text-xs">optional</span>
                    </label>
                    <EClassPicker
                      value={newElementSemanticId}
                      onChange={(irdi, prop) => {
                        setNewElementSemanticId(irdi)
                        // Auto-fill valueType when an eCLASS property is selected
                        if (prop?.xsdType) {
                          setNewElementValueType(prop.xsdType)
                        }
                      }}
                      placeholder="Search eCLASS or enter IRDI / URI..."
                    />
                  </div>

                  {/* Description (optional) */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Description
                      <span className="text-gray-400 text-xs">optional</span>
                    </label>
                    <textarea
                      value={newElementDescription}
                      onChange={(e) => setNewElementDescription(e.target.value)}
                      placeholder="Brief description of this element..."
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-white focus:outline-none focus:border-[#61caf3] focus:ring-4 focus:ring-[#61caf3]/20 placeholder:text-gray-400 resize-none"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900/80 dark:to-gray-800/50 border-t border-gray-200/50 dark:border-gray-700/50 flex justify-between">
                  <button
                    onClick={() => setAddElementStep(1)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={addElement}
                    disabled={!newElementIdShort.trim() || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newElementIdShort)}
                    className={cn(
                      "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-200",
                      newElementIdShort.trim() && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newElementIdShort)
                        ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white shadow-lg shadow-[#61caf3]/25 hover:shadow-[#61caf3]/40 hover:scale-[1.02]"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    )}
                  >
                    <Plus className="w-5 h-5" />
                    Add Element
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PDF Selection Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={(open) => open ? setPdfDialogOpen(true) : closePdfDialog()}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Select PDFs to download</DialogTitle>
            <DialogDescription>
              Found {pdfEntries.length} PDF{pdfEntries.length > 1 ? "s" : ""}. Preview files and choose which to download.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pdfSelected.size === pdfEntries.length && pdfEntries.length > 0}
                  onCheckedChange={(v) => toggleSelectAll(!!v)}
                />
                <span className="text-sm">Select all</span>
              </div>
              <div className="text-xs text-gray-500">
                Selected {pdfSelected.size}/{pdfEntries.length}
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {pdfEntries.map((e) => (
                <div key={e.name} className="flex items-center justify-between rounded border px-3 py-2 bg-white dark:bg-gray-900">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={pdfSelected.has(e.name)}
                      onCheckedChange={(v) => togglePdfSelection(e.name, !!v)}
                    />
                    <div>
                      <div className="text-sm font-medium">{e.name}</div>
                      <div className="text-xs text-gray-500">{Math.max(1, Math.round(e.bytes.length / 1024))} KB</div>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(e.url, "_blank")}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Open preview"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="text-sm">Preview</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePdfDialog}>Cancel</Button>
            <Button onClick={downloadSelectedPdfs} className="bg-[#61caf3] hover:bg-[#4db6e6] text-white">
              <FileDown className="w-4 h-4 mr-2" />
              Download selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW: Improved Validation Result Dialog */}
      <ValidationDialog
        open={validationDialogOpen}
        onOpenChange={(open) => {
          setValidationDialogOpen(open);
          if (!open) setValidationDialogDismissed(true);
        }}
        alerts={validationAlerts}
        isFixing={isFixing}
        onFix={sourceXml ? handleFixClick : undefined}
        onGoToPath={goToIssuePath}
        title={validationDialogStatus === 'valid' ? "Validation Passed" : "Validation Results"}
      />

      {/* Popup: No PDFs found */}
      <AlertDialog open={noPdfsDialogOpen} onOpenChange={setNoPdfsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No PDFs found</AlertDialogTitle>
            <AlertDialogDescription>
              This model does not contain any File elements with PDF content to download.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}