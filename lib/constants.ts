/**
 * Centralized constants for AAS Forge
 * Contains IEC 61360 data types, XSD value types, element colors, and other shared values
 */

// IEC 61360 data types
export const IEC_DATA_TYPES = [
  'DATE',
  'STRING',
  'STRING_TRANSLATABLE',
  'INTEGER_MEASURE',
  'INTEGER_COUNT',
  'INTEGER_CURRENCY',
  'REAL_MEASURE',
  'REAL_COUNT',
  'REAL_CURRENCY',
  'BOOLEAN',
  'IRI',
  'IRDI',
  'RATIONAL',
  'RATIONAL_MEASURE',
  'TIME',
  'TIMESTAMP',
  'FILE',
  'HTML',
  'BLOB',
] as const;

export type IECDataType = typeof IEC_DATA_TYPES[number];

// XSD value types
export const XSD_VALUE_TYPES = [
  'xs:string', 'xs:boolean', 'xs:decimal', 'xs:integer', 'xs:long', 'xs:int', 'xs:short', 'xs:byte',
  'xs:double', 'xs:float', 'xs:dateTime', 'xs:date', 'xs:time', 'xs:anyURI', 'xs:duration',
  'xs:gYearMonth', 'xs:gYear', 'xs:gMonthDay', 'xs:gDay', 'xs:gMonth',
  'xs:unsignedLong', 'xs:unsignedInt', 'xs:unsignedShort', 'xs:unsignedByte',
  'xs:base64Binary', 'xs:hexBinary'
] as const;

export type XSDValueType = typeof XSD_VALUE_TYPES[number];

// Canonical mapping for XSD types (lowercase local name -> canonical form)
export const XSD_CANON_MAP: Record<string, string> =
  Object.fromEntries(XSD_VALUE_TYPES.map(t => [t.slice(3).toLowerCase(), t]));

// AAS 3.1 namespace
export const AAS_NAMESPACE_3_1 = "https://admin-shell.io/aas/3/1";

// Submodel element model types
export const SUBMODEL_ELEMENT_TYPES = [
  'Property',
  'MultiLanguageProperty',
  'SubmodelElementCollection',
  'SubmodelElementList',
  'File',
  'Blob',
  'Range',
  'ReferenceElement',
  'Entity',
  'Capability',
  'Operation',
  'BasicEventElement',
  'RelationshipElement',
  'AnnotatedRelationshipElement',
] as const;

export type SubmodelElementType = typeof SUBMODEL_ELEMENT_TYPES[number];

// Container element types (can have children)
export const CONTAINER_ELEMENT_TYPES = [
  'SubmodelElementCollection',
  'SubmodelElementList',
  'Entity',
] as const;

export type ContainerElementType = typeof CONTAINER_ELEMENT_TYPES[number];

// Type color mapping for element headers/backgrounds
export const ELEMENT_TYPE_COLORS: Record<string, string> = {
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
};

// Badge color classes for element types
export const ELEMENT_BADGE_COLORS: Record<string, string> = {
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
};

// Short badge labels for element types
export const ELEMENT_BADGE_LABELS: Record<string, string> = {
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
};

// Helper functions

/**
 * Normalize a value type string to canonical XSD form
 */
export function normalizeValueType(t?: string): string | undefined {
  if (!t) return undefined;
  const s = t.trim();
  if (!s) return undefined;
  const hasPrefix = s.slice(0, 3).toLowerCase() === 'xs:';
  const local = hasPrefix ? s.slice(3) : s;
  const canonical = XSD_CANON_MAP[local.toLowerCase()];
  return canonical || undefined;
}

/**
 * Derive XSD value type from IEC 61360 data type
 */
export function deriveValueTypeFromIEC(iec?: string): string | undefined {
  switch ((iec || '').toUpperCase()) {
    case 'DATE': return 'xs:date';
    case 'STRING': return 'xs:string';
    case 'STRING_TRANSLATABLE': return 'xs:string';
    case 'INTEGER_MEASURE':
    case 'INTEGER_COUNT':
    case 'INTEGER_CURRENCY': return 'xs:integer';
    case 'REAL_MEASURE':
    case 'REAL_COUNT':
    case 'REAL_CURRENCY': return 'xs:decimal';
    case 'BOOLEAN': return 'xs:boolean';
    case 'IRI': return 'xs:anyURI';
    case 'IRDI': return 'xs:string';
    case 'RATIONAL':
    case 'RATIONAL_MEASURE': return 'xs:string';
    case 'TIME': return 'xs:time';
    case 'TIMESTAMP': return 'xs:dateTime';
    case 'FILE': return 'xs:string';
    case 'HTML': return 'xs:string';
    case 'BLOB': return 'xs:base64Binary';
    default: return undefined;
  }
}

/**
 * Validate a string value against its declared XSD type
 */
export function isValidValueForXsdType(vt: string, val: string): boolean {
  const v = (val ?? '').trim();
  if (!v) return true; // empties handled by required checks
  switch (vt) {
    case 'xs:boolean': {
      const lower = v.toLowerCase();
      return lower === 'true' || lower === 'false' || v === '1' || v === '0';
    }
    case 'xs:integer':
    case 'xs:int':
    case 'xs:long':
    case 'xs:short':
    case 'xs:byte':
      return /^-?\d+$/.test(v);
    case 'xs:unsignedLong':
    case 'xs:unsignedInt':
    case 'xs:unsignedShort':
    case 'xs:unsignedByte':
      return /^\d+$/.test(v);
    case 'xs:float':
    case 'xs:double':
    case 'xs:decimal':
      return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v);
    default:
      return true;
  }
}

/**
 * Escape special XML characters
 */
export function escapeXml(s?: string): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert hex color to rgba
 */
export function hexToRgba(hex: string, opacity: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get color for element type
 */
export function getElementTypeColor(type: string): string {
  return ELEMENT_TYPE_COLORS[type] || "#1793b8";
}

/**
 * Get badge color class for element type
 */
export function getElementBadgeColor(type: string): string {
  return ELEMENT_BADGE_COLORS[type] || "bg-gray-500 text-white";
}

/**
 * Get short badge label for element type
 */
export function getElementBadgeLabel(type: string): string {
  return ELEMENT_BADGE_LABELS[type] || "Node";
}

/**
 * Check if element type is a container (can have children)
 */
export function isContainerType(type: string): boolean {
  return CONTAINER_ELEMENT_TYPES.includes(type as ContainerElementType);
}

// idShort validation regex pattern (AAS 3.1 compliant)
export const ID_SHORT_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z]$/;

/**
 * Validate idShort against AAS 3.1 specification
 */
export function isValidIdShort(idShort: string): boolean {
  return ID_SHORT_PATTERN.test(idShort.trim());
}

// URI validation pattern
export const URI_PATTERN = /^(https?:\/\/|urn:|file:\/\/)/i;

/**
 * Validate URI format
 */
export function isValidUri(uri: string): boolean {
  return URI_PATTERN.test(uri.trim());
}

// Brand color
export const BRAND_COLOR = "#61caf3";
export const BRAND_COLOR_DARK = "#4db6e6";
export const BRAND_COLOR_DARKER = "#3a9fd4";
