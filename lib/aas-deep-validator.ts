/**
 * AAS Deep Validator — single source of truth for AAS JSON validation.
 *
 * This module operates on **raw AAS JSON** (the on-wire V3.0 / V3.1 format),
 * NOT on internal React `SubmodelElement` interfaces.
 *
 * Both the Hub API (`/api/validate-deep`) and the Python aas-crew call this
 * through a thin HTTP wrapper.  The React editor / visualizer import the
 * shared pure helpers from `@/lib/constants`.
 */

import {
  XSD_VALUE_TYPES,
  SUBMODEL_ELEMENT_TYPES,
  ID_SHORT_PATTERN,
  isValidIdShort,
  normalizeValueType,
  isValidValueForXsdType,
} from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────

export interface DeepValidationError {
  path: string;
  message: string;
  severity: "error";
}

export interface DeepValidationWarning {
  path: string;
  message: string;
  severity: "warning";
}

export type DeepValidationIssue = DeepValidationError | DeepValidationWarning;

export interface DeepValidationSummary {
  shells: number;
  submodels: number;
  conceptDescriptions: number;
  elements: number;
  submodelIds: string[];
}

export interface DeepValidationResult {
  valid: boolean;
  errors: DeepValidationError[];
  warnings: DeepValidationWarning[];
  summary: DeepValidationSummary;
}

// ─── Constant sets ──────────────────────────────────────

const REQUIRED_TOP_LEVEL_KEYS = new Set(["assetAdministrationShells", "submodels"]);
const ALLOWED_TOP_LEVEL_KEYS = new Set(["assetAdministrationShells", "submodels", "conceptDescriptions"]);
const REQUIRED_AAS_KEYS = new Set(["idShort", "id", "assetInformation"]);
const REQUIRED_ASSET_INFO_KEYS = new Set(["assetKind", "globalAssetId"]);
const VALID_ASSET_KINDS = new Set(["Instance", "Type", "NotApplicable"]);
const REQUIRED_SUBMODEL_KEYS = new Set(["idShort", "id", "submodelElements"]);

const VALID_MODEL_TYPES: Set<string> = new Set(SUBMODEL_ELEMENT_TYPES);
const VALID_XSD_SET: Set<string> = new Set(XSD_VALUE_TYPES);

const KNOWN_SUBMODEL_SEMANTIC_IDS = new Set([
  "https://admin-shell.io/zvei/nameplate/2/0/Nameplate",
  "https://admin-shell.io/zvei/nameplate/1/0/Nameplate",
  "https://admin-shell.io/idta/nameplate/3/0/Nameplate",
  "https://admin-shell.io/idta/SoftwareNameplate/1/0",
  "https://admin-shell.io/idta/AssetInterfacesDescription/1/0/Submodel",
  "https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2",
  "https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/1",
  "https://admin-shell.io/zvei/nameplate/2/0/Nameplate/ContactInformation",
  "https://admin-shell.io/idta/OperationalData/1/0",
  "https://admin-shell.io/idta/AssetInterfacesMappingConfiguration/1/0/Submodel",
]);

const KNOWN_ELEMENT_SEMANTIC_ID_PREFIXES = [
  "0173-1#",
  "0173-1---",
  "https://admin-shell.io/",
];

const HALLUCINATED_PATTERNS = [
  "https://example.com",
  "https://example.org",
  "http://example.com",
  "http://example.org",
  "https://www.example",
  "urn:example:",
];

// ─── Main entry point ───────────────────────────────────

/**
 * Run deep validation on a raw AAS JSON object.
 *
 * Returns errors, warnings and a summary — callers decide how to act.
 */
export function validateDeep(data: unknown): DeepValidationResult {
  const errors: DeepValidationError[] = [];
  const warnings: DeepValidationWarning[] = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push(err("/", "Input must be a JSON object"));
    return { valid: false, errors, warnings, summary: emptySummary() };
  }

  const obj = data as Record<string, unknown>;

  // ── 1. Top-level structure ──
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in obj)) {
      errors.push(err("/", `Missing required top-level key: '${key}'`));
    }
  }

  const extraKeys = Object.keys(obj).filter((k) => !ALLOWED_TOP_LEVEL_KEYS.has(k));
  if (extraKeys.length > 0) {
    errors.push(
      err("/", `Invalid top-level keys: ${JSON.stringify(extraKeys)}. Only allowed: assetAdministrationShells, submodels, conceptDescriptions`)
    );
  }

  // ── 2. Asset Administration Shells ──
  const shells = asArray(obj.assetAdministrationShells);
  if (shells.length === 0) {
    errors.push(err("/assetAdministrationShells", "'assetAdministrationShells' is empty — at least one AAS required."));
  }

  for (let i = 0; i < shells.length; i++) {
    const aas = shells[i];
    const p = `/assetAdministrationShells/${i}`;
    if (!isObj(aas)) {
      errors.push(err(p, "Shell must be an object"));
      continue;
    }
    for (const key of REQUIRED_AAS_KEYS) {
      if (!(key in aas)) errors.push(err(p, `Missing required key '${key}'`));
    }

    // idShort pattern
    if (aas.idShort && typeof aas.idShort === "string" && !isValidIdShort(aas.idShort)) {
      errors.push(err(`${p}/idShort`, `idShort '${aas.idShort}' does not match AAS 3.1 pattern`));
    }

    // assetInformation
    const ai = aas.assetInformation;
    if (isObj(ai)) {
      for (const key of REQUIRED_ASSET_INFO_KEYS) {
        if (!(key in ai)) errors.push(err(`${p}/assetInformation`, `Missing '${key}'`));
      }
      if (ai.assetKind && !VALID_ASSET_KINDS.has(ai.assetKind as string)) {
        errors.push(err(`${p}/assetInformation/assetKind`, `Invalid value '${ai.assetKind}'`));
      }
    }

    // Submodel references
    const smRefs = asArray(aas.submodels);
    if (smRefs.length === 0) {
      warnings.push(warn(p, "No submodel references found"));
    }
  }

  // ── 3. Submodels ──
  const submodels = asArray(obj.submodels);
  if (submodels.length === 0) {
    errors.push(err("/submodels", "'submodels' is empty — at least one Submodel required."));
  }

  let totalElements = 0;
  const submodelIds: string[] = [];
  const knownSubmodelIds = new Set<string>();

  for (let i = 0; i < submodels.length; i++) {
    const sm = submodels[i];
    const p = `/submodels/${i}`;
    if (!isObj(sm)) {
      errors.push(err(p, "Submodel must be an object"));
      continue;
    }

    for (const key of REQUIRED_SUBMODEL_KEYS) {
      if (!(key in sm)) errors.push(err(p, `Missing required key '${key}'`));
    }

    // Common mistakes
    if ("elements" in sm && !("submodelElements" in sm)) {
      errors.push(err(p, `Uses 'elements' instead of 'submodelElements' — must use 'submodelElements'`));
    }
    if ("name" in sm && !("idShort" in sm)) {
      errors.push(err(p, `Uses 'name' instead of 'idShort' — must use 'idShort'`));
    }

    // idShort pattern
    if (sm.idShort && typeof sm.idShort === "string") {
      if (!isValidIdShort(sm.idShort)) {
        errors.push(err(`${p}/idShort`, `idShort '${sm.idShort}' does not match AAS 3.1 pattern`));
      }
      submodelIds.push(sm.idShort as string);
    }

    if (sm.id && typeof sm.id === "string") {
      knownSubmodelIds.add(sm.id as string);
    }

    // semanticId
    validateSemanticId(sm.semanticId, p, true, errors, warnings);

    // submodelElements
    const elements = asArray(sm.submodelElements);
    if (elements.length === 0) {
      warnings.push(warn(p, "Has no submodelElements"));
    }
    for (let j = 0; j < elements.length; j++) {
      totalElements += validateElement(elements[j], `${p}/submodelElements/${j}`, errors, warnings);
    }
  }

  // ── 4. Cross-reference consistency ──
  const refTargets: Array<{ path: string; targetId: string }> = [];
  for (let i = 0; i < submodels.length; i++) {
    const sm = submodels[i];
    if (isObj(sm)) {
      collectReferenceTargets(asArray(sm.submodelElements), `/submodels/${i}/submodelElements`, refTargets);
    }
  }
  for (const { path, targetId } of refTargets) {
    if (!knownSubmodelIds.has(targetId)) {
      warnings.push(
        warn(path, `ReferenceElement points to submodel '${targetId}' which does not exist in this AAS package. Known IDs: [${[...knownSubmodelIds].sort().join(", ")}]`)
      );
    }
  }

  // ── 5. Summary ──
  const conceptDescriptions = asArray(obj.conceptDescriptions);
  const summary: DeepValidationSummary = {
    shells: shells.length,
    submodels: submodels.length,
    conceptDescriptions: conceptDescriptions.length,
    elements: totalElements,
    submodelIds,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

// ─── Element validation (recursive) ─────────────────────

/**
 * Validate a single SubmodelElement (raw JSON), recursing into children.
 * Returns the count of elements visited (including this one).
 */
function validateElement(
  elem: unknown,
  path: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): number {
  if (!isObj(elem)) {
    errors.push(err(path, "Element must be an object"));
    return 1;
  }

  let count = 1;
  const idShort = str(elem.idShort) || "?";
  const label = `${path} (${idShort})`;

  // idShort
  if (!("idShort" in elem)) {
    errors.push(err(path, "Missing 'idShort'"));
  } else if (typeof elem.idShort === "string" && !isValidIdShort(elem.idShort)) {
    errors.push(err(`${path}/idShort`, `idShort '${elem.idShort}' does not match AAS 3.1 pattern`));
  }

  // modelType
  const modelType = str(elem.modelType);
  if (!modelType) {
    errors.push(err(path, `${idShort}: Missing 'modelType'`));
  } else if (!VALID_MODEL_TYPES.has(modelType)) {
    errors.push(err(path, `${idShort}: Invalid modelType '${modelType}'`));
  }

  // semanticId
  validateSemanticId(elem.semanticId, label, false, errors, warnings);

  // ── Type-specific checks ──

  if (modelType === "Property") {
    count += validateProperty(elem, path, idShort, errors, warnings);
  }

  if (modelType === "SubmodelElementCollection") {
    const children = asArray(elem.value);
    if ("value" in elem && !Array.isArray(elem.value)) {
      errors.push(err(path, `${idShort}: SubmodelElementCollection 'value' must be an array, got ${typeof elem.value}`));
    }
    for (let k = 0; k < children.length; k++) {
      count += validateElement(children[k], `${path}/value/${k}`, errors, warnings);
    }
  }

  if (modelType === "SubmodelElementList") {
    count += validateSubmodelElementList(elem, path, idShort, errors, warnings);
  }

  if (modelType === "Operation") {
    count += validateOperation(elem, path, idShort, errors, warnings);
  }

  if (modelType === "BasicEventElement") {
    validateBasicEventElement(elem, path, idShort, errors, warnings);
  }

  if (modelType === "ReferenceElement") {
    validateReferenceElement(elem, path, idShort, errors, warnings);
  }

  if (modelType === "RelationshipElement" || modelType === "AnnotatedRelationshipElement") {
    validateRelationshipElement(elem, path, idShort, errors, warnings);
  }

  if (modelType === "Range") {
    validateRange(elem, path, idShort, errors, warnings);
  }

  if (modelType === "MultiLanguageProperty") {
    validateMultiLanguageProperty(elem, path, idShort, errors, warnings);
  }

  if (modelType === "File") {
    validateFile(elem, path, idShort, errors, warnings);
  }

  if (modelType === "Blob") {
    validateBlob(elem, path, idShort, errors, warnings);
  }

  return count;
}

// ─── Property ───────────────────────────────────────────

function validateProperty(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): number {
  if (!("valueType" in elem)) {
    errors.push(err(path, `${idShort}: Property missing 'valueType'`));
  } else {
    const vt = str(elem.valueType);
    if (vt && !VALID_XSD_SET.has(vt)) {
      // Attempt normalization
      const normalized = normalizeValueType(vt);
      if (normalized) {
        warnings.push(warn(path, `${idShort}: valueType '${vt}' should be written as '${normalized}'`));
      } else {
        errors.push(err(path, `${idShort}: Invalid valueType '${vt}'`));
      }
    }

    // Value-vs-valueType consistency
    if (vt && elem.value != null && elem.value !== "") {
      const val = String(elem.value);
      if (!isValidValueForXsdType(vt, val)) {
        errors.push(
          err(path, `${idShort}: value "${val}" is not valid for valueType '${vt}'`)
        );
      }
    }
  }
  return 0;
}

// ─── SubmodelElementList ────────────────────────────────

function validateSubmodelElementList(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): number {
  let count = 0;
  const typeVal = str(elem.typeValueListElement);
  if (!typeVal) {
    errors.push(err(path, `${idShort}: SubmodelElementList missing 'typeValueListElement'`));
  } else if (!VALID_MODEL_TYPES.has(typeVal)) {
    warnings.push(warn(path, `${idShort}: SubmodelElementList.typeValueListElement '${typeVal}' is not a known modelType`));
  }

  if ("value" in elem && !Array.isArray(elem.value)) {
    errors.push(err(path, `${idShort}: SubmodelElementList 'value' must be an array, got ${typeof elem.value}`));
  }

  const children = asArray(elem.value);
  for (let k = 0; k < children.length; k++) {
    const child = children[k];
    if (isObj(child)) {
      const childType = str(child.modelType);
      if (typeVal && childType && childType !== typeVal) {
        errors.push(
          err(`${path}/value/${k}`, `modelType '${childType}' does not match SubmodelElementList typeValueListElement '${typeVal}'`)
        );
      }
      count += validateElement(child, `${path}/value/${k}`, errors, warnings);
    }
  }
  return count;
}

// ─── Operation ──────────────────────────────────────────

function validateOperation(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): number {
  let count = 0;
  for (const varKind of ["inputVariables", "outputVariables", "inoutputVariables"] as const) {
    const variables = elem[varKind];
    if (variables != null) {
      if (!Array.isArray(variables)) {
        errors.push(err(path, `${idShort}: Operation.${varKind} must be an array, got ${typeof variables}`));
      } else {
        for (let vi = 0; vi < variables.length; vi++) {
          const wrapper = variables[vi];
          const vp = `${path}/${varKind}/${vi}`;
          if (!isObj(wrapper)) {
            errors.push(err(vp, "Variable wrapper must be an object with 'value' key"));
          } else if (!("value" in wrapper)) {
            errors.push(err(vp, `${idShort}: variable wrapper must have a 'value' key containing a SubmodelElement`));
          } else if (isObj(wrapper.value)) {
            count += validateElement(wrapper.value, `${vp}/value`, errors, warnings);
          }
        }
      }
    }
  }

  // Qualifiers
  const qualifiers = elem.qualifiers;
  if (qualifiers != null) {
    if (!Array.isArray(qualifiers)) {
      warnings.push(warn(path, `${idShort}: Operation.qualifiers should be an array`));
    } else {
      for (let qi = 0; qi < qualifiers.length; qi++) {
        const q = qualifiers[qi];
        if (!isObj(q) || !("type" in q)) {
          warnings.push(warn(`${path}/qualifiers/${qi}`, "qualifier must have a 'type' field"));
        }
      }
    }
  }
  return count;
}

// ─── BasicEventElement ──────────────────────────────────

function validateBasicEventElement(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  if (!("observed" in elem)) {
    errors.push(err(path, `${idShort}: BasicEventElement missing 'observed' reference`));
  } else if (isObj(elem.observed)) {
    const obs = elem.observed as Record<string, unknown>;
    if (obs.type !== "ModelReference" && obs.type !== "ExternalReference") {
      errors.push(err(path, `${idShort}: BasicEventElement.observed.type must be 'ModelReference' or 'ExternalReference'`));
    }
  }

  const direction = str(elem.direction);
  if (direction && direction !== "input" && direction !== "output") {
    errors.push(err(path, `${idShort}: BasicEventElement.direction must be 'input' or 'output', got '${direction}'`));
  }

  const state = str(elem.state);
  if (state && state !== "on" && state !== "off") {
    errors.push(err(path, `${idShort}: BasicEventElement.state must be 'on' or 'off', got '${state}'`));
  }
}

// ─── ReferenceElement ───────────────────────────────────

function validateReferenceElement(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  const refValue = elem.value;
  if (refValue == null) {
    warnings.push(warn(path, `${idShort}: ReferenceElement missing 'value' (reference target)`));
  } else if (isObj(refValue)) {
    const rv = refValue as Record<string, unknown>;
    if (rv.type !== "ModelReference" && rv.type !== "ExternalReference") {
      errors.push(err(path, `${idShort}: ReferenceElement.value.type must be 'ModelReference' or 'ExternalReference', got '${rv.type}'`));
    }
    const keys = asArray(rv.keys);
    if (keys.length === 0) {
      errors.push(err(path, `${idShort}: ReferenceElement.value.keys must be a non-empty array`));
    }
  } else {
    errors.push(err(path, `${idShort}: ReferenceElement.value must be a Reference object, got ${typeof refValue}`));
  }
}

// ─── RelationshipElement ────────────────────────────────

function validateRelationshipElement(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  for (const refName of ["first", "second"] as const) {
    const refObj = elem[refName];
    if (refObj == null) {
      errors.push(err(path, `${idShort}: RelationshipElement missing '${refName}' reference (required)`));
    } else if (isObj(refObj)) {
      const r = refObj as Record<string, unknown>;
      if (r.type !== "ModelReference" && r.type !== "ExternalReference") {
        errors.push(err(path, `${idShort}: RelationshipElement.${refName}.type must be 'ModelReference' or 'ExternalReference', got '${r.type}'`));
      }
      const keys = asArray(r.keys);
      if (keys.length === 0) {
        errors.push(err(path, `${idShort}: RelationshipElement.${refName}.keys must be a non-empty array`));
      }
    } else {
      errors.push(err(path, `${idShort}: RelationshipElement.${refName} must be a Reference object, got ${typeof refObj}`));
    }
  }
}

// ─── Range ──────────────────────────────────────────────

function validateRange(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  if (!("valueType" in elem)) {
    errors.push(err(path, `${idShort}: Range missing 'valueType'`));
  } else {
    const vt = str(elem.valueType);
    if (vt && !VALID_XSD_SET.has(vt)) {
      errors.push(err(path, `${idShort}: Range has invalid valueType '${vt}'`));
    }
    // Value consistency for min/max
    if (vt) {
      for (const bound of ["min", "max"] as const) {
        const val = elem[bound];
        if (val != null && val !== "") {
          if (!isValidValueForXsdType(vt, String(val))) {
            errors.push(err(path, `${idShort}: Range.${bound} value "${val}" is not valid for valueType '${vt}'`));
          }
        }
      }
    }
  }
}

// ─── MultiLanguageProperty ──────────────────────────────

function validateMultiLanguageProperty(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  _errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  const value = elem.value;
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    warnings.push(warn(path, `${idShort}: MultiLanguageProperty has no language values`));
  } else if (Array.isArray(value)) {
    for (let li = 0; li < value.length; li++) {
      const lv = value[li];
      if (!isObj(lv) || !("language" in lv) || !("text" in lv)) {
        warnings.push(warn(`${path}/value/${li}`, `${idShort}: Each language value should have 'language' and 'text' fields`));
      }
    }
  }
}

// ─── File ───────────────────────────────────────────────

function validateFile(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  _warnings: DeepValidationWarning[],
): void {
  if (!("contentType" in elem)) {
    errors.push(err(path, `${idShort}: File element missing 'contentType'`));
  }
}

// ─── Blob ───────────────────────────────────────────────

function validateBlob(
  elem: Record<string, unknown>,
  path: string,
  idShort: string,
  errors: DeepValidationError[],
  _warnings: DeepValidationWarning[],
): void {
  if (!("contentType" in elem)) {
    errors.push(err(path, `${idShort}: Blob element missing 'contentType'`));
  }
}

// ─── SemanticId validation ──────────────────────────────

function validateSemanticId(
  semId: unknown,
  path: string,
  isSubmodel: boolean,
  errors: DeepValidationError[],
  warnings: DeepValidationWarning[],
): void {
  if (semId == null) {
    warnings.push(warn(path, "No semanticId — recommended for IDTA compliance"));
    return;
  }

  if (typeof semId === "string") {
    errors.push(
      err(path, `semanticId is a plain string but MUST be an ExternalReference object: {"type": "ExternalReference", "keys": [{"type": "GlobalReference", "value": "..."}]}`)
    );
    return;
  }

  if (!isObj(semId)) return;

  const sid = semId as Record<string, unknown>;
  if (sid.type !== "ExternalReference" && sid.type !== "ModelReference") {
    errors.push(err(path, `semanticId.type must be 'ExternalReference' or 'ModelReference', got '${sid.type}'`));
  }

  // Extract the value string from keys[0]
  const keys = asArray(sid.keys);
  if (keys.length === 0) return;
  const firstKey = keys[0];
  if (!isObj(firstKey)) return;
  const value = str((firstKey as Record<string, unknown>).value);
  if (!value) return;

  // Check for hallucination
  for (const pattern of HALLUCINATED_PATTERNS) {
    if (value.startsWith(pattern)) {
      errors.push(
        err(path, `semanticId '${value}' appears to be hallucinated (uses '${pattern}'). Use a real ECLASS IRDI or IDTA URL, or omit the semanticId if no known value applies.`)
      );
      return;
    }
  }

  // Check known-ness
  if (isSubmodel) {
    if (!KNOWN_SUBMODEL_SEMANTIC_IDS.has(value)) {
      warnings.push(
        warn(path, `semanticId '${value}' is not a recognized IDTA Submodel Template URL. Known templates: Nameplate, SoftwareNameplate, AssetInterfacesDescription, TechnicalData, OperationalData.`)
      );
    }
  } else {
    if (!KNOWN_ELEMENT_SEMANTIC_ID_PREFIXES.some((p) => value.startsWith(p))) {
      warnings.push(
        warn(path, `semanticId '${value}' does not match known ECLASS (0173-1#...) or IDTA (https://admin-shell.io/...) patterns. Verify this is a real standard identifier.`)
      );
    }
  }
}

// ─── Cross-reference collection ─────────────────────────

function collectReferenceTargets(
  elements: unknown[],
  basePath: string,
  targets: Array<{ path: string; targetId: string }>,
): void {
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (!isObj(elem)) continue;
    const e = elem as Record<string, unknown>;
    const ep = `${basePath}/${i}`;
    const modelType = str(e.modelType);

    // ReferenceElement
    if (modelType === "ReferenceElement" && isObj(e.value)) {
      extractSubmodelRefKeys(e.value as Record<string, unknown>, ep, targets);
    }

    // RelationshipElement
    if (modelType === "RelationshipElement" || modelType === "AnnotatedRelationshipElement") {
      for (const ref of ["first", "second"]) {
        if (isObj(e[ref])) {
          extractSubmodelRefKeys(e[ref] as Record<string, unknown>, `${ep}/${ref}`, targets);
        }
      }
    }

    // Recurse into containers
    if (modelType === "SubmodelElementCollection" || modelType === "SubmodelElementList") {
      collectReferenceTargets(asArray(e.value), `${ep}/value`, targets);
    }

    // Recurse into Operation variables
    if (modelType === "Operation") {
      for (const varKind of ["inputVariables", "outputVariables", "inoutputVariables"]) {
        const vars = asArray(e[varKind]);
        for (let vi = 0; vi < vars.length; vi++) {
          const wrapper = vars[vi];
          if (isObj(wrapper)) {
            const inner = (wrapper as Record<string, unknown>).value;
            if (isObj(inner) && str((inner as Record<string, unknown>).modelType) === "ReferenceElement") {
              const refVal = (inner as Record<string, unknown>).value;
              if (isObj(refVal)) {
                extractSubmodelRefKeys(refVal as Record<string, unknown>, `${ep}/${varKind}/${vi}/value`, targets);
              }
            }
          }
        }
      }
    }
  }
}

function extractSubmodelRefKeys(
  refObj: Record<string, unknown>,
  path: string,
  targets: Array<{ path: string; targetId: string }>,
): void {
  const keys = asArray(refObj.keys);
  for (const k of keys) {
    if (isObj(k)) {
      const keyObj = k as Record<string, unknown>;
      if (keyObj.type === "Submodel" && typeof keyObj.value === "string") {
        targets.push({ path, targetId: keyObj.value });
        break;
      }
    }
  }
}

// ─── Utility helpers ────────────────────────────────────

function err(path: string, message: string): DeepValidationError {
  return { path, message, severity: "error" };
}

function warn(path: string, message: string): DeepValidationWarning {
  return { path, message, severity: "warning" };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function emptySummary(): DeepValidationSummary {
  return { shells: 0, submodels: 0, conceptDescriptions: 0, elements: 0, submodelIds: [] };
}
