// "use client"

// import { useState } from "react"
// import { Upload, Plus, Home as HomeIcon } from 'lucide-react'
// import { AASXVisualizer } from "@/components/aasx-visualizer"
// import { AASCreator } from "@/components/aas-creator"
// import { AASEditor } from "@/components/aas-editor"
// import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
// import HomeView from "@/components/home-view"
// import UploadDialog from "@/components/upload-dialog"

// type ViewMode = "home" | "upload" | "visualizer" | "creator" | "editor"

// export default function VisualizerPage() {
//   const [viewMode, setViewMode] = useState<ViewMode>("home")
//   const [uploadedFiles, setUploadedFiles] = useState<ValidationResult[]>([])
//   const [newFileIndex, setNewFileIndex] = useState<number | null>(null)
//   const [currentAASConfig, setCurrentAASConfig] = useState<any>(null)
//   const [initialSubmodelData, setInitialSubmodelData] = useState<Record<string, any> | null>(null)
//   const [editorFileIndex, setEditorFileIndex] = useState<number | null>(null)

//   const reorderFiles = (fromIndex: number, toIndex: number) => {
//     setUploadedFiles((prev) => {
//       if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev
//       const next = [...prev]
//       const [moved] = next.splice(fromIndex, 1)
//       next.splice(toIndex, 0, moved)
//       return next
//     })
//   }

//   const handleDataUploaded = (fileData: ValidationResult) => {
//     console.log("[v0] Page received file data:", fileData)
//     setUploadedFiles((prev) => {
//       const newFiles = [...prev, fileData]
//       setNewFileIndex(newFiles.length - 1)
//       return newFiles
//     })
//     // After upload, go back to Home as requested
//     setViewMode("home")
//   }

//   const handleProceedToEditor = (config: any) => {
//     setCurrentAASConfig(config)
//     setViewMode("editor")
//    setEditorFileIndex(null)
//   }

//   const handleFileGenerated = async (fileData: ValidationResult) => {
//     console.log("[v0] Generated file received:", fileData)
    
//     setUploadedFiles((prev) => {
//       // NEW: If editing an existing file, replace it instead of appending
//       if (editorFileIndex !== null && editorFileIndex >= 0 && editorFileIndex < prev.length) {
//         const next = [...prev]
//         const existing = next[editorFileIndex]
//         next[editorFileIndex] = {
//           ...existing,
//           ...fileData,
//           file: fileData.file || existing.file,
//         }
//         return next
//       }
//       // Otherwise append as new
//       return [...prev, fileData]
//     })
    
//     // Keep Editor view; only set editorFileIndex when we appended a new item
//     if (editorFileIndex === null) {
//       setEditorFileIndex(uploadedFiles.length) // index of newly added file
//     }
//   }

//   // Callback to update AASConfig from AASEditor
//   const updateAASConfig = (newConfig: any) => {
//     setCurrentAASConfig(newConfig)
//   }

//   const handleSaveFile = (fileData: ValidationResult) => {
//     if (editorFileIndex === null) {
//       // No specific file selected, append
//       setUploadedFiles((prev) => [...prev, fileData])
//       return
//     }
//     setUploadedFiles((prev) => {
//       const next = [...prev]
//       const existing = next[editorFileIndex]
//       next[editorFileIndex] = {
//         ...existing,
//         ...fileData,
//         file: existing.file || fileData.file,
//       }
//       return next
//     })
//   }

//   // NEW: Delete a file by index
//   const deleteFileAt = (index: number) => {
//     setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
//     // Optional: adjust editorFileIndex if needed
//     if (editorFileIndex !== null) {
//       if (index === editorFileIndex) {
//         setEditorFileIndex(null)
//       } else if (index < editorFileIndex) {
//         setEditorFileIndex(editorFileIndex - 1)
//       }
//     }
//   }

//   const openVisualizerAt = (index: number) => {
//     if (index < 0 || index >= uploadedFiles.length) return
//     const file = uploadedFiles[index]
//     const env = file.aasData
//     if (!env || !Array.isArray(env.assetAdministrationShells) || !env.assetAdministrationShells[0]) {
//       return
//     }
//     const shell = env.assetAdministrationShells[0]
//     const submodels = Array.isArray(env.submodels) ? env.submodels : []
//     // Build Editor config from existing AAS
//     const selectedSubmodels = submodels.map((sm: any) => ({
//       idShort: sm.idShort || `Submodel`,
//       template: {
//         name: sm.idShort || `Submodel`,
//         version: "1.0",
//         description: "Imported submodel",
//         url: sm.semanticId?.keys?.[0]?.value || `https://admin-shell.io/submodels/${sm.idShort || 'submodel'}`
//       }
//     }))
//     const cfg = {
//       idShort: shell.idShort || "ImportedAAS",
//       id: shell.id || "https://example.com/aas/imported",
//       assetKind: shell.assetKind || "Instance",
//       globalAssetId: shell.assetInformation?.globalAssetId || "",
//       selectedSubmodels
//     }
//     // Map submodelElements into Editor format
//     const mapDescription = (desc: any): string | undefined => {
//       if (!desc) return undefined
//       if (typeof desc === "string") return desc
//       if (Array.isArray(desc)) {
//         const en = desc.find((d: any) => d.language === 'en')
//         return (en?.text || desc[0]?.text) || undefined
//       }
//       return undefined
//     }
//     const mapSemanticId = (sid: any): string | undefined => {
//       if (!sid) return undefined
//       if (typeof sid === "string") return sid
//       const key = sid?.keys?.[0]
//       return key?.value || undefined
//     }
//     const mapCardinality = (el: any): "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany" => {
//       const q = Array.isArray(el.qualifiers) ? el.qualifiers.find((x: any) => x?.type === "Cardinality") : null
//       const v = q?.value || el.cardinality
//       if (v === "One" || v === "ZeroToOne" || v === "ZeroToMany" || v === "OneToMany") return v
//       return "ZeroToOne"
//     }
//     const mapMLPValue = (val: any): Record<string, string> => {
//       if (Array.isArray(val)) {
//         const out: Record<string, string> = {}
//         val.forEach((item: any) => {
//           if (item?.language) out[item.language] = item.text || ""
//         })
//         if (!out.en) out.en = ""
//         return out
//       }
//       if (typeof val === "object" && val) return val
//       return { en: "" }
//     }
//     const mapElement = (el: any): any => {
//       const type = el.modelType || "Property"
//       const base: any = {
//         idShort: el.idShort || "Element",
//         modelType: type,
//         cardinality: mapCardinality(el),
//         description: mapDescription(el.description),
//         semanticId: mapSemanticId(el.semanticId),
//         preferredName: el.preferredName,
//         shortName: el.shortName,
//         unit: el.unit,
//         dataType: el.dataType,
//         category: el.category,
//         valueType: el.valueType,
//       }
//       if (type === "Property") {
//         base.value = typeof el.value === "string" ? el.value : ""
//       } else if (type === "MultiLanguageProperty") {
//         base.value = mapMLPValue(el.value)
//       } else if (type === "File") {
//         base.value = typeof el.value === "string" ? el.value : ""
//         base.fileData = el.fileData
//       } else if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
//         const children = Array.isArray(el.value) ? el.value.map(mapElement) : []
//         base.children = children
//       }
//       return base
//     }
//     const initial: Record<string, any[]> = {}
//     submodels.forEach((sm: any) => {
//       const elements = Array.isArray(sm.submodelElements) ? sm.submodelElements.map(mapElement) : []
//       initial[sm.idShort || "Submodel"] = elements
//     })
//     setCurrentAASConfig(cfg)
//     setInitialSubmodelData(initial)
//    setEditorFileIndex(index)
//     setViewMode("editor")
//   }

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
//       {/* Header */}
//       <div className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-b border-blue-200 dark:border-gray-700">
//         <button
//           onClick={() => setViewMode("home")}
//           className="flex items-center gap-2"
//           aria-label="Go Home"
//         >
//           <img
//             src="https://support.industry.siemens.com/cs/images/109963158/109963158_AssetAdministrationShell_01.png"
//             alt="AAS Hub Logo"
//             className="w-8 h-8"
//           />
//           <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
//             AAS Hub
//           </span>
//         </button>
//         <div className="flex gap-2">
//           <button
//             onClick={() => setViewMode("home")}
//             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
//               viewMode === "home"
//                 ? "bg-gray-600 text-white shadow-md"
//                 : "bg-white/70 text-gray-700 hover:bg-white dark:bg-gray-700 dark:text-gray-200"
//             }`}
//           >
//             <HomeIcon className="w-4 h-4" />
//             Home
//           </button>
//           <button
//             onClick={() => currentAASConfig && setViewMode("editor")}
//             disabled={!currentAASConfig}
//             className={`px-4 py-2 rounded-lg font-medium transition-all ${
//               viewMode === "editor"
//                 ? "bg-yellow-600 text-white shadow-md"
//                 : currentAASConfig
//                   ? "bg-white/70 text-yellow-600 hover:bg-white dark:bg-gray-700 dark:text-yellow-400"
//                   : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800"
//             }`}
//           >
//             Editor
//           </button>
//         </div>
//       </div>

//       {/* Main Content Area */}
//       <div className="h-[calc(100vh-73px)]">
//         {viewMode === "home" && (
//           <HomeView
//             files={uploadedFiles}
//             onOpen={openVisualizerAt}
//             onUploadClick={() => setViewMode("upload")}
//             onCreateClick={() => setViewMode("creator")}
//             onReorder={reorderFiles}
//             onDelete={deleteFileAt}
//           />
//         )}
//         {viewMode === "upload" && (
//           <UploadDialog
//             onDataUploaded={handleDataUploaded}
//             onClose={() => setViewMode("home")}
//           />
//         )}
//         {viewMode === "creator" && (
//           <AASCreator
//             onProceedToEditor={handleProceedToEditor}
//             onClose={() => setViewMode("home")}
//           />
//         )}
//         {viewMode === "editor" && currentAASConfig && (
//           <AASEditor 
//             aasConfig={currentAASConfig} 
//             onBack={() => setViewMode("home")} 
//             onFileGenerated={handleFileGenerated}
//             onUpdateAASConfig={updateAASConfig}
//             initialSubmodelData={initialSubmodelData || undefined}
//             onSave={handleSaveFile}
//             initialThumbnail={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.thumbnail || null : null}
//             sourceXml={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.originalXml || undefined : undefined}
//             attachments={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.attachments || undefined : undefined}
//           />
//         )}
//         {/* Visualizer view is no longer reachable from the navbar; kept for internal use if needed */}
//       </div>
//     </div>
//   )
// }

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Upload, Plus, HomeIcon, Sparkles, Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from "next-themes"
import { AASXVisualizer } from "@/components/aasx-visualizer"
import { AASCreator } from "@/components/aas-creator"
import { AASEditor } from "@/components/aas-editor"
import type { ValidationResult } from "@/lib/types"
import HomeView from "@/components/home-view"
import UploadDialog from "@/components/upload-dialog"
import { fixXml } from "@/lib/fix-xml"
import { validateAASXXml } from "@/lib/xml-validator"
import { toast } from "sonner"
import JSZip from "jszip"
import { saveModels, loadModels, clearModels } from "@/lib/storage"
import { downloadValidationReport } from "@/lib/pdf-report"
import { ErrorBoundary } from "@/components/error-boundary"

type ViewMode = "home" | "upload" | "visualizer" | "creator" | "editor"

export default function VisualizerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("home")
  const [uploadedFiles, setUploadedFiles] = useState<ValidationResult[]>([])
  const [newFileIndex, setNewFileIndex] = useState<number | null>(null)
  const [currentAASConfig, setCurrentAASConfig] = useState<any>(null)
  const [initialSubmodelData, setInitialSubmodelData] = useState<Record<string, any> | null>(null)
  const [editorFileIndex, setEditorFileIndex] = useState<number | null>(null)
  const [fixingIndex, setFixingIndex] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [recentFiles, setRecentFiles] = useState<number[]>([])
  const { theme, setTheme, resolvedTheme } = useTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load models from IndexedDB on mount
  useEffect(() => {
    const load = async () => {
      try {
        const models = await loadModels()
        if (models.length > 0) {
          setUploadedFiles(models)
          toast.success(`Loaded ${models.length} model${models.length !== 1 ? 's' : ''} from storage`)
        }
      } catch (err) {
        console.warn("Failed to load models from IndexedDB:", err)
      } finally {
        setStorageLoaded(true)
      }
    }
    load()
  }, [])

  // Save models to IndexedDB whenever they change
  useEffect(() => {
    if (!storageLoaded) return // Don't save until initial load is complete
    const save = async () => {
      try {
        if (uploadedFiles.length === 0) {
          await clearModels()
        } else {
          await saveModels(uploadedFiles)
        }
      } catch (err) {
        console.warn("Failed to save models to IndexedDB:", err)
        toast.error("Failed to save models to storage.", {
          description: "Your changes may not persist after refresh.",
        })
      }
    }
    save()
  }, [uploadedFiles, storageLoaded])

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && viewMode === "home") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Ctrl+U or Cmd+U - Upload
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault()
        setViewMode("upload")
      }
      // Ctrl+N or Cmd+N - Create new
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        setViewMode("creator")
      }
      // Escape - Go home
      if (e.key === "Escape" && viewMode !== "home") {
        setViewMode("home")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [viewMode])

  // Track recent files when opening
  const trackRecentFile = useCallback((index: number) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(i => i !== index)
      return [index, ...filtered].slice(0, 5) // Keep last 5
    })
  }, [])

  // Cycle through themes: light -> dark -> system
  const cycleTheme = useCallback(() => {
    if (theme === "light") {
      setTheme("dark")
    } else if (theme === "dark") {
      setTheme("system")
    } else {
      setTheme("light")
    }
  }, [theme, setTheme])

  // Get current theme icon
  const getThemeIcon = () => {
    if (!mounted) return <Sun className="w-4 h-4" />
    if (theme === "system") return <Monitor className="w-4 h-4" />
    if (resolvedTheme === "dark") return <Moon className="w-4 h-4" />
    return <Sun className="w-4 h-4" />
  }

  // Get theme label for tooltip
  const getThemeLabel = () => {
    if (!mounted) return "Theme"
    if (theme === "system") return "System theme"
    if (theme === "dark") return "Dark mode"
    return "Light mode"
  }

  const reorderFiles = (fromIndex: number, toIndex: number) => {
    setUploadedFiles((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleDataUploaded = (fileData: ValidationResult) => {
    setUploadedFiles((prev) => {
      const newFiles = [...prev, fileData]
      setNewFileIndex(newFiles.length - 1)
      return newFiles
    })
    setViewMode("home")
  }

  const handleProceedToEditor = (config: any) => {
    setCurrentAASConfig(config)
    setViewMode("editor")
   setEditorFileIndex(null)
  }

  const handleFileGenerated = async (fileData: ValidationResult) => {
    setUploadedFiles((prev) => {
      if (editorFileIndex !== null && editorFileIndex >= 0 && editorFileIndex < prev.length) {
        const next = [...prev]
        const existing = next[editorFileIndex]
        next[editorFileIndex] = {
          ...existing,
          ...fileData,
          file: fileData.file || existing.file,
        }
        return next
      }
      return [...prev, fileData]
    })
    
    if (editorFileIndex === null) {
      setEditorFileIndex(uploadedFiles.length)
    }
  }

  const updateAASConfig = (newConfig: any) => {
    setCurrentAASConfig(newConfig)
  }

  const handleSaveFile = (fileData: ValidationResult) => {
    if (editorFileIndex === null) {
      setUploadedFiles((prev) => [...prev, fileData])
      return
    }
    setUploadedFiles((prev) => {
      const next = [...prev]
      const existing = next[editorFileIndex]
      next[editorFileIndex] = {
        ...existing,
        ...fileData,
        file: existing.file || fileData.file,
      }
      return next
    })
  }

  const deleteFileAt = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
    if (editorFileIndex !== null) {
      if (index === editorFileIndex) {
        setEditorFileIndex(null)
      } else if (index < editorFileIndex) {
        setEditorFileIndex(editorFileIndex - 1)
      }
    }
  }

  const handleFix = async (index: number) => {
    const file = uploadedFiles[index]
    if (!file || !file.originalXml) {
      toast.error("No XML data available to fix")
      return
    }

    const fileName = file.file || "Unknown file"
    setFixingIndex(index)
    try {
      // Apply fixes to the XML
      const result = fixXml(file.originalXml)
      if (!result.success) {
        toast.error(result.error || "Failed to fix XML")
        return
      }

      // Log detailed fix information for the user
      if (result.fixes.length > 0) {
        console.group(`🔧 AAS Fix Summary for "${fileName}"`)
        console.log(`Total fixes applied: ${result.fixCount}`)
        console.table(result.fixes.map((fix, i) => ({
          "#": i + 1,
          "Element": fix.element,
          "Issue": fix.issue,
          "Fix Applied": fix.fix
        })))
        console.groupEnd()
      }

      // Re-validate the fixed XML
      const validationResult = await validateAASXXml(result.xml)

      // Log validation result for debugging
      if (!validationResult.valid) {
        console.group(`❌ Remaining validation errors for "${fileName}"`)
        console.log(`Errors count: ${validationResult.errors?.length || 0}`)
        if (validationResult.errors) {
          validationResult.errors.forEach((err, i) => {
            if (typeof err === 'string') {
              console.log(`${i + 1}. ${err}`)
            } else {
              console.log(`${i + 1}. [${err.path}] ${err.message}`)
            }
          })
        }
        console.groupEnd()
      }

      // Update the file in state with fixed XML and new validation status
      setUploadedFiles((prev) => {
        const next = [...prev]
        next[index] = {
          ...next[index],
          originalXml: result.xml,
          valid: validationResult.valid,
          errors: validationResult.valid ? undefined : validationResult.errors,
          // Store the applied fixes for reporting
          appliedFixes: result.fixes.length > 0 ? result.fixes : undefined,
        }
        return next
      })

      if (validationResult.valid) {
        toast.success(`Fixed ${result.fixCount} issues! File is now valid.`)
      } else {
        const errorCount = validationResult.errors?.length || 0
        toast.warning(`Applied ${result.fixCount} fixes, but ${errorCount} issues remain. Check console for details.`)
      }
    } catch (error) {
      console.error(`Error fixing "${fileName}":`, error)
      toast.error("An error occurred while fixing the file")
    } finally {
      setFixingIndex(null)
    }
  }

  const handleDownload = async (index: number, format: "aasx" | "json" = "aasx") => {
    const file = uploadedFiles[index]
    if (!file) {
      toast.error("File not found")
      return
    }

    // Get the idShort for the filename
    const idShort = file.aasData?.assetAdministrationShells?.[0]?.idShort ||
                    file.parsed?.assetAdministrationShells?.[0]?.idShort ||
                    "aas"

    // JSON Export
    if (format === "json") {
      const aasData = file.aasData || file.parsed
      if (!aasData) {
        toast.error("No AAS data available to export")
        return
      }

      // Create AAS 3.1 JSON structure
      const jsonExport = {
        assetAdministrationShells: aasData.assetAdministrationShells || [],
        submodels: aasData.submodels || [],
        conceptDescriptions: aasData.conceptDescriptions || [],
      }

      const filename = `${idShort}.json`
      const blob = new Blob([JSON.stringify(jsonExport, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${filename}`)
      return
    }

    // AASX Export
    if (!file.originalXml) {
      toast.error("No XML data available to download")
      return
    }

    // If we have the original AASX, recreate it with fixed XML
    if (file.originalAasxBase64 && file.aasxXmlPath) {
      try {
        // Decode the original AASX
        const binaryString = atob(file.originalAasxBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Load the ZIP
        const zip = new JSZip()
        await zip.loadAsync(bytes)

        // Replace the XML file with the fixed version
        zip.file(file.aasxXmlPath, file.originalXml)

        // Generate the new AASX
        const newAasxBlob = await zip.generateAsync({ type: "blob" })

        // Download
        const filename = file.file || `${idShort}.aasx`
        const url = URL.createObjectURL(newAasxBlob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success(`Downloaded ${filename}`)
      } catch (error) {
        console.error("Error recreating AASX:", error)
        toast.error("Failed to recreate AASX file")
      }
    } else {
      // Fallback: download just the XML
      const filename = `${idShort}.xml`
      const blob = new Blob([file.originalXml], { type: "application/xml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Downloaded ${filename}`)
    }
  }

  // Duplicate a model
  const handleDuplicate = (index: number) => {
    const file = uploadedFiles[index]
    if (!file) {
      toast.error("File not found")
      return
    }

    const idShort = file.aasData?.assetAdministrationShells?.[0]?.idShort ||
                    file.parsed?.assetAdministrationShells?.[0]?.idShort ||
                    "AAS"

    // Deep clone the file
    const duplicated: ValidationResult = JSON.parse(JSON.stringify(file))

    // Update the filename to indicate it's a copy
    duplicated.file = `${idShort}_copy.${file.type === "AASX" ? "aasx" : file.type?.toLowerCase() || "xml"}`

    // Add to the list
    setUploadedFiles(prev => [...prev, duplicated])
    toast.success(`Duplicated "${idShort}" as "${duplicated.file}"`)
  }

  const handleGenerateReport = async (index: number) => {
    const file = uploadedFiles[index]
    if (!file) {
      toast.error("File not found")
      return
    }

    const idShort = file.aasData?.assetAdministrationShells?.[0]?.idShort ||
                    file.parsed?.assetAdministrationShells?.[0]?.idShort ||
                    "aas"

    try {
      toast.loading(`Generating report for ${idShort}...`, { id: "report-gen" })
      await downloadValidationReport(file)
      toast.success(`Report generated successfully!`, { id: "report-gen" })
    } catch (error) {
      console.error("Error generating report:", error)
      toast.error("Failed to generate report", { id: "report-gen" })
    }
  }

  const openVisualizerAt = (index: number) => {
    if (index < 0 || index >= uploadedFiles.length) return
    const file = uploadedFiles[index]
    const env = file.aasData
    if (!env || !Array.isArray(env.assetAdministrationShells) || !env.assetAdministrationShells[0]) {
      return
    }
    // Track as recently opened
    trackRecentFile(index)
    const shell = env.assetAdministrationShells[0]
    const submodels = Array.isArray(env.submodels) ? env.submodels : []
    const selectedSubmodels = submodels.map((sm: any) => ({
      idShort: sm.idShort || `Submodel`,
      template: {
        name: sm.idShort || `Submodel`,
        version: "1.0",
        description: "Imported submodel",
        url: sm.semanticId?.keys?.[0]?.value || `https://admin-shell.io/submodels/${sm.idShort || 'submodel'}`
      }
    }))
    
    const cfg = {
      idShort: shell.idShort || "ImportedAAS",
      id: shell.id || "https://example.com/aas/imported",
      assetKind: shell.assetKind || "Instance",
      globalAssetId: shell.globalAssetId || "",
      selectedSubmodels
    }
    
    const mapDescription = (desc: any): string | undefined => {
      if (!desc) return undefined
      if (typeof desc === "string") return desc
      if (Array.isArray(desc)) {
        const en = desc.find((d: any) => d.language === 'en')
        return (en?.text || desc[0]?.text) || undefined
      }
      return undefined
    }
    const mapSemanticId = (sid: any): string | undefined => {
      if (!sid) return undefined
      if (typeof sid === "string") return sid
      const key = sid?.keys?.[0]
      return key?.value || undefined
    }
    const mapCardinality = (el: any): "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany" => {
      const q = Array.isArray(el.qualifiers) ? el.qualifiers.find((x: any) => x?.type === "Cardinality") : null
      const v = q?.value || el.cardinality
      if (v === "One" || v === "ZeroToOne" || v === "ZeroToMany" || v === "OneToMany") return v
      return "ZeroToOne"
    }
    const mapMLPValue = (val: any): Record<string, string> => {
      if (Array.isArray(val)) {
        const out: Record<string, string> = {}
        val.forEach((item: any) => {
          if (item?.language) out[item.language] = item.text || ""
        })
        if (!out.en) out.en = ""
        return out
      }
      if (typeof val === "object" && val) return val
      return { en: "" }
    }
    const mapElement = (el: any): any => {
      const type = el.modelType || "Property"
      const base: any = {
        idShort: el.idShort || "Element",
        modelType: type,
        cardinality: mapCardinality(el),
        description: mapDescription(el.description),
        semanticId: mapSemanticId(el.semanticId),
        preferredName: el.preferredName,
        shortName: el.shortName,
        unit: el.unit,
        dataType: el.dataType,
        category: el.category,
        valueType: el.valueType,
      }
      if (type === "Property") {
        base.value = typeof el.value === "string" ? el.value : ""
      } else if (type === "MultiLanguageProperty") {
        base.value = mapMLPValue(el.value)
      } else if (type === "File") {
        base.value = typeof el.value === "string" ? el.value : ""
        base.fileData = el.fileData
      } else if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
        const children = Array.isArray(el.value) ? el.value.map(mapElement) : []
        base.children = children
      }
      return base
    }
    const initial: Record<string, any[]> = {}
    submodels.forEach((sm: any) => {
      const elements = Array.isArray(sm.submodelElements) ? sm.submodelElements.map(mapElement) : []
      initial[sm.idShort || "Submodel"] = elements
    })
    setCurrentAASConfig(cfg)
    setInitialSubmodelData(initial)
   setEditorFileIndex(index)
    setViewMode("editor")
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-sky-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        {/* Modern Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <button
            onClick={() => setViewMode("home")}
            className="flex items-center gap-3 group"
            aria-label="Go Home"
          >
            <div className="p-2 bg-gradient-to-br from-[#61caf3] to-[#4db6e6] rounded-xl shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/30 transition-all duration-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-[#61caf3] to-[#3a9fd4] bg-clip-text text-transparent">
              AAS Forge
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("home")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                viewMode === "home"
                  ? "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white shadow-lg shadow-cyan-500/30"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <HomeIcon className="w-4 h-4" />
              Home
            </button>
            {/* Theme Toggle */}
            <button
              onClick={cycleTheme}
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
              title={getThemeLabel()}
              aria-label={getThemeLabel()}
            >
              {getThemeIcon()}
            </button>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-73px)]">
        {viewMode === "home" && (
          <HomeView
            files={uploadedFiles}
            onOpen={openVisualizerAt}
            onUploadClick={() => setViewMode("upload")}
            onCreateClick={() => setViewMode("creator")}
            onReorder={reorderFiles}
            onDelete={deleteFileAt}
            onFix={handleFix}
            fixingIndex={fixingIndex}
            onDownload={handleDownload}
            onGenerateReport={handleGenerateReport}
            onDuplicate={handleDuplicate}
            recentFiles={recentFiles}
            searchInputRef={searchInputRef}
          />
        )}
        {viewMode === "upload" && (
          <UploadDialog
            onDataUploaded={handleDataUploaded}
            onClose={() => setViewMode("home")}
          />
        )}
        {viewMode === "creator" && (
          <AASCreator
            onProceedToEditor={handleProceedToEditor}
            onClose={() => setViewMode("home")}
          />
        )}
        {viewMode === "editor" && currentAASConfig && (
          <AASEditor
            key={editorFileIndex ?? "new"}
            aasConfig={currentAASConfig}
            onBack={() => setViewMode("home")}
            onFileGenerated={handleFileGenerated}
            onUpdateAASConfig={updateAASConfig}
            initialSubmodelData={initialSubmodelData || undefined}
            onSave={handleSaveFile}
            initialThumbnail={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.thumbnail || null : null}
            sourceXml={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.originalXml || undefined : undefined}
            attachments={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.attachments || undefined : undefined}
          />
        )}
      </div>
      </div>
    </ErrorBoundary>
  )
}