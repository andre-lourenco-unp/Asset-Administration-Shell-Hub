"use client";

import React from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, AlertCircle, CheckCircle, Upload, Plus, X, Wrench, Loader2, Download, Sparkles, Package, FolderOpen, CheckSquare, Square, Trash2, FileSpreadsheet, Copy, FileJson, RotateCcw, Clock } from "lucide-react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import type { ValidationResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HomeViewProps {
  files: ValidationResult[];
  onOpen: (index: number) => void;
  onUploadClick: () => void;
  onCreateClick: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (index: number) => void;
  onFix?: (index: number) => void;
  fixingIndex?: number | null;
  onDownload?: (index: number, format?: "aasx" | "json") => void;
  onGenerateReport?: (index: number) => void;
  onDuplicate?: (index: number) => void;
  recentFiles?: number[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function HomeView({ files, onOpen, onUploadClick, onCreateClick, onReorder, onDelete, onFix, fixingIndex, onDownload, onGenerateReport, onDuplicate, recentFiles = [], searchInputRef }: HomeViewProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedSubmodels, setSelectedSubmodels] = React.useState<Set<string>>(new Set());
  const [validityFilter, setValidityFilter] = React.useState<"all" | "valid" | "invalid">("all");
  const localSearchRef = React.useRef<HTMLInputElement>(null);
  const effectiveSearchRef = searchInputRef || localSearchRef;

  // Check if any filters are active
  const hasActiveFilters = searchQuery.trim() !== "" || selectedSubmodels.size > 0 || validityFilter !== "all";

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedSubmodels(new Set());
    setValidityFilter("all");
  };

  // Batch selection state
  const [selectedFiles, setSelectedFiles] = React.useState<Set<number>>(new Set());
  const [batchFixingCount, setBatchFixingCount] = React.useState(0);

  // Toggle file selection
  const toggleFileSelection = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Select/deselect all visible files
  const toggleSelectAll = () => {
    const visibleIndices = filteredFiles.map((_, i) => files.indexOf(filteredFiles[i]));
    const allSelected = visibleIndices.every((i) => selectedFiles.has(i));
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(visibleIndices));
    }
  };

  // Batch delete
  const handleBatchDelete = () => {
    const indices = Array.from(selectedFiles).sort((a, b) => b - a); // Delete from end to preserve indices
    indices.forEach((i) => onDelete(i));
    setSelectedFiles(new Set());
  };

  // Batch fix
  const handleBatchFix = async () => {
    if (!onFix) return;
    const invalidIndices = Array.from(selectedFiles).filter((i) => files[i]?.valid === false);
    setBatchFixingCount(invalidIndices.length);
    for (const i of invalidIndices) {
      await onFix(i);
    }
    setBatchFixingCount(0);
    setSelectedFiles(new Set());
  };

  // Batch download
  const handleBatchDownload = () => {
    if (!onDownload) return;
    const validIndices = Array.from(selectedFiles).filter((i) => files[i]?.valid === true);
    validIndices.forEach((i) => onDownload(i));
    setSelectedFiles(new Set());
  };

  // Batch report generation
  const handleBatchReport = () => {
    if (!onGenerateReport) return;
    const validIndices = Array.from(selectedFiles).filter((i) => files[i]?.valid === true);
    validIndices.forEach((i) => onGenerateReport(i));
    setSelectedFiles(new Set());
  };

  // Get batch stats
  const batchStats = React.useMemo(() => {
    const selected = Array.from(selectedFiles);
    return {
      total: selected.length,
      valid: selected.filter((i) => files[i]?.valid === true).length,
      invalid: selected.filter((i) => files[i]?.valid === false).length,
    };
  }, [selectedFiles, files]);

  // Clear selection when files change
  React.useEffect(() => {
    setSelectedFiles(new Set());
  }, [files.length]);

  const getIdShort = (file: ValidationResult): string => {
    const idShort =
      (file.aasData as any)?.assetAdministrationShells?.[0]?.idShort ||
      (file.parsed as any)?.assetAdministrationShells?.[0]?.idShort ||
      "";
    return idShort || file.file || "AAS";
  };

  const extractSubmodelNames = (file: ValidationResult): string[] => {
    const subs = ((file.aasData as any)?.submodels || (file.parsed as any)?.submodels || [])
      .map((sm: any) => sm?.idShort)
      .filter(Boolean);
    if (subs.length) return Array.from(new Set(subs));
    const refs = ((file.aasData as any)?.assetAdministrationShells?.[0]?.submodels ||
      (file.parsed as any)?.assetAdministrationShells?.[0]?.submodels ||
      []);
    const fromRefs = refs
      .map((ref: any) => ref?.idShort || ref?.keys?.[0]?.value || ref?.keys?.[0]?.idShort)
      .filter(Boolean);
    return Array.from(new Set(fromRefs));
  };

  const allSubmodelOptions = React.useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      extractSubmodelNames(f).forEach((name) => set.add(name));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const filteredFiles = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasSubmodelFilter = selectedSubmodels.size > 0;
    return files.filter((file) => {
      const idShort = getIdShort(file).toLowerCase();
      const filename = (file.file || "").toLowerCase();
      const matchesQuery = q === "" ? true : idShort.includes(q) || filename.includes(q);
      if (!matchesQuery) return false;
      if (hasSubmodelFilter) {
        const subs = extractSubmodelNames(file);
        if (!subs.some((s) => selectedSubmodels.has(s))) return false;
      }
      if (validityFilter === "valid" && file.valid !== true) return false;
      if (validityFilter === "invalid" && file.valid !== false) return false;
      return true;
    });
  }, [files, searchQuery, selectedSubmodels, validityFilter]);

  // Validation summary stats
  const validationStats = React.useMemo(() => {
    const total = files.length;
    const valid = files.filter((f) => f.valid === true).length;
    const invalid = files.filter((f) => f.valid === false).length;
    const pending = files.filter((f) => f.valid === undefined).length;
    const percentage = total > 0 ? Math.round((valid / total) * 100) : 0;
    return { total, valid, invalid, pending, percentage };
  }, [files]);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-cyan-50/30 to-sky-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="px-6 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#61caf3] via-[#4db6e6] to-[#3a9fd4] p-8 shadow-xl shadow-cyan-500/20">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-24 -translate-x-24 blur-2xl" />

            <div className="relative z-10 flex items-center justify-between gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-white/80 text-sm font-medium tracking-wide uppercase">Asset Administration Shell</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                  Your AAS Models
                </h1>
                <p className="text-white/80 text-lg max-w-2xl">
                  {files.length > 0
                    ? `Managing ${files.length} model${files.length !== 1 ? 's' : ''} • ${filteredFiles.length} visible`
                    : "Upload or create your first Asset Administration Shell to get started"}
                </p>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 mt-6">
                  <Button
                    onClick={onUploadClick}
                    className="bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 shadow-lg transition-all duration-200 gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload AAS
                  </Button>
                  <Button
                    onClick={onCreateClick}
                    className="bg-white text-[#61caf3] hover:bg-white/90 shadow-lg shadow-black/10 transition-all duration-200 gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Create New AAS
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Filters Bar */}
        {files.length > 0 && (
          <>
          <div className="mb-6">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      ref={effectiveSearchRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or file... (Ctrl+F)"
                      className="pl-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
                      aria-label="Search models"
                    />
                  </div>
                  {allSubmodelOptions.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="flex items-center gap-2 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <Filter className="h-4 w-4" />
                          <span className="hidden sm:inline">Submodels</span>
                          {selectedSubmodels.size > 0 && (
                            <span className="ml-1 rounded-full bg-[#61caf3] text-white px-2 py-0.5 text-xs font-medium">
                              {selectedSubmodels.size}
                            </span>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72 max-w-[90vw]">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span>Filter by submodel</span>
                          <span className="text-xs font-normal text-gray-400">
                            {allSubmodelOptions.length} available
                          </span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="max-h-64 overflow-y-auto">
                          {allSubmodelOptions.map((name) => (
                            <DropdownMenuCheckboxItem
                              key={name}
                              checked={selectedSubmodels.has(name)}
                              onCheckedChange={(checked) => {
                                setSelectedSubmodels((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(name);
                                  else next.delete(name);
                                  return next;
                                });
                              }}
                              className="pr-2"
                              title={name}
                            >
                              <span className="truncate">{name}</span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                        {selectedSubmodels.size > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 text-xs"
                              onClick={() => setSelectedSubmodels(new Set())}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Clear {selectedSubmodels.size} filter{selectedSubmodels.size !== 1 ? 's' : ''}
                            </Button>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Select value={validityFilter} onValueChange={(v) => setValidityFilter(v as "all" | "valid" | "invalid")}>
                    <SelectTrigger className="w-32 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Validity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Clear All Filters Button */}
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Validation Summary Card */}
          <div className="mb-6">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-6 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{validationStats.total}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{validationStats.valid}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Valid</div>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">{validationStats.invalid}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Invalid</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 max-w-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Compliance Rate</span>
                    <span className="text-sm font-bold text-[#61caf3]">{validationStats.percentage}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#61caf3] to-[#4db6e6] rounded-full transition-all duration-500"
                      style={{ width: `${validationStats.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Files Section */}
          {recentFiles.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Recently Opened</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {recentFiles.slice(0, 5).map((fileIndex) => {
                  const file = files[fileIndex];
                  if (!file) return null;
                  const idShort = getIdShort(file);
                  return (
                    <button
                      key={`recent-${fileIndex}`}
                      onClick={() => onOpen(fileIndex)}
                      className="flex items-center gap-2 px-3 py-2 bg-white/70 dark:bg-gray-800/70 rounded-lg border border-gray-200/50 dark:border-gray-700/50 hover:border-[#61caf3]/50 hover:shadow-sm transition-all duration-200 whitespace-nowrap"
                    >
                      <FileText className="w-4 h-4 text-[#61caf3]" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{idShort}</span>
                      {file.valid === true && (
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                      )}
                      {file.valid === false && (
                        <AlertCircle className="w-3 h-3 text-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Batch Action Bar */}
          {selectedFiles.size > 0 && (
            <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#61caf3]/10 to-[#4db6e6]/10 border border-[#61caf3]/30">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {filteredFiles.every((_, i) => selectedFiles.has(files.indexOf(filteredFiles[i]))) ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-[#61caf3]" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      Select All
                    </>
                  )}
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-[#61caf3]">{selectedFiles.size}</span> file{selectedFiles.size !== 1 ? 's' : ''} selected
                  {batchStats.valid > 0 && (
                    <span className="ml-2 text-emerald-600">({batchStats.valid} valid)</span>
                  )}
                  {batchStats.invalid > 0 && (
                    <span className="ml-2 text-red-500">({batchStats.invalid} invalid)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {batchStats.invalid > 0 && onFix && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchFix}
                    disabled={batchFixingCount > 0}
                    className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1.5"
                  >
                    {batchFixingCount > 0 ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench className="w-3.5 h-3.5" />
                        Fix {batchStats.invalid}
                      </>
                    )}
                  </Button>
                )}
                {batchStats.valid > 0 && onDownload && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchDownload}
                    className="border-[#61caf3] text-[#61caf3] hover:bg-[#61caf3]/10 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {batchStats.valid}
                  </Button>
                )}
                {batchStats.valid > 0 && onGenerateReport && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchReport}
                    className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Report {batchStats.valid}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchDelete}
                  className="border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete {selectedFiles.size}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedFiles(new Set())}
                  className="text-gray-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
        )}

        {/* Empty State */}
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="p-6 bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-900/30 dark:to-sky-900/30 rounded-2xl mb-6">
              <FolderOpen className="w-16 h-16 text-[#61caf3]" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">No models yet</h3>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
              Get started by uploading an existing AASX/AAS file or create a new Asset Administration Shell from scratch.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={onUploadClick}
                variant="outline"
                className="border-[#61caf3] text-[#61caf3] hover:bg-[#61caf3]/10 gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload File
              </Button>
              <Button
                onClick={onCreateClick}
                className="bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white hover:shadow-lg hover:shadow-cyan-500/30 transition-all duration-200 gap-2"
              >
                <Plus className="w-4 h-4" />
                Create New
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredFiles.map((file, filteredIdx) => {
              const actualIndex = files.indexOf(file);
              const idShort = getIdShort(file);
              const thumb = file.thumbnail || "/placeholder.svg";
              const submodels = extractSubmodelNames(file);
              const isSelected = selectedFiles.has(actualIndex);

              return (
                <Card
                  key={`${file.file}-${filteredIdx}`}
                  className={cn(
                    "group relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm",
                    "border-2 transition-all duration-300 cursor-pointer",
                    "rounded-xl overflow-hidden",
                    isSelected
                      ? "border-[#61caf3] ring-2 ring-[#61caf3]/30 shadow-lg shadow-cyan-500/20"
                      : "border-gray-200/60 dark:border-gray-700/60 hover:border-[#61caf3]/50 hover:shadow-lg hover:shadow-cyan-500/10",
                    dragOverIndex === filteredIdx && "ring-2 ring-[#61caf3] ring-offset-2"
                  )}
                  onClick={() => onOpen(actualIndex)}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(actualIndex);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== actualIndex) setDragOverIndex(filteredIdx);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== actualIndex) {
                      onReorder(dragIndex, actualIndex);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  {/* Selection Checkbox */}
                  <button
                    onClick={(e) => toggleFileSelection(actualIndex, e)}
                    className={cn(
                      "absolute top-2 left-2 z-10 p-1.5 rounded-lg transition-all duration-200",
                      isSelected
                        ? "bg-[#61caf3] text-white"
                        : "bg-white/80 dark:bg-gray-800/80 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-[#61caf3]"
                    )}
                    aria-label={isSelected ? `Deselect ${idShort}` : `Select ${idShort}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {/* Validity Badge */}
                  {file.valid !== undefined && (
                    <div className="absolute top-2 right-2 z-10">
                      {file.valid === true ? (
                        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 px-2.5 py-1 shadow-sm">
                          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                            IDTA
                          </span>
                        </div>
                      ) : file.valid === false ? (
                        <div className="flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 px-2.5 py-1 shadow-sm">
                          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                            Invalid
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="flex h-44">
                    {/* Thumbnail */}
                    <div className="ml-10 h-full aspect-square bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                      {file.thumbnail ? (
                        <img
                          src={thumb}
                          alt={`${idShort} thumbnail`}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <div className="p-4 bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-900/30 dark:to-sky-900/30 rounded-xl">
                          <FileText className="w-8 h-8 text-[#61caf3]" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 flex flex-col justify-between p-4">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {idShort}
                        </CardTitle>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
                          {file.file}
                        </div>
                        {submodels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {submodels.slice(0, 2).map((sm) => (
                              <span
                                key={sm}
                                className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                              >
                                {sm}
                              </span>
                            ))}
                            {submodels.length > 2 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                +{submodels.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2">
                        {file.valid === false && onFix && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-400 text-amber-600 hover:bg-amber-50 hover:border-amber-500 dark:hover:bg-amber-950/30 transition-colors text-xs h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFix(actualIndex);
                            }}
                            disabled={fixingIndex === actualIndex}
                          >
                            {fixingIndex === actualIndex ? (
                              <>
                                <Loader2 className="mr-1 w-3 h-3 animate-spin" />
                                Fixing
                              </>
                            ) : (
                              <>
                                <Wrench className="mr-1 w-3 h-3" />
                                Fix
                              </>
                            )}
                          </Button>
                        )}
                        {file.valid === true && onDuplicate && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors text-xs h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicate(actualIndex);
                            }}
                            title="Duplicate model"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                        {file.valid === true && onDownload && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[#61caf3] text-[#61caf3] hover:bg-[#61caf3]/10 hover:border-[#4db6e6] transition-colors text-xs h-7 px-2"
                              >
                                <Download className="mr-1 w-3 h-3" />
                                Export
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuLabel className="text-xs">Export format</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <button
                                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-800"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownload(actualIndex, "aasx");
                                }}
                              >
                                <Package className="mr-2 w-4 h-4 text-[#61caf3]" />
                                AASX Package
                              </button>
                              <button
                                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-800"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownload(actualIndex, "json");
                                }}
                              >
                                <FileJson className="mr-2 w-4 h-4 text-amber-500" />
                                JSON Format
                              </button>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {file.valid === true && onGenerateReport && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-600 dark:hover:bg-emerald-950/30 transition-colors text-xs h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateReport(actualIndex);
                            }}
                          >
                            <FileSpreadsheet className="mr-1 w-3 h-3" />
                            Report
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className={cn(
                            "text-xs h-7 px-3 transition-all duration-200",
                            "bg-gradient-to-r from-[#61caf3] to-[#4db6e6] text-white",
                            "hover:shadow-md hover:shadow-cyan-500/30 hover:scale-[1.02]"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(actualIndex);
                          }}
                        >
                          Open
                          <ArrowRight className="ml-1 w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
