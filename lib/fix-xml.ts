/**
 * Standalone XML fixing utility for AAS 3.1 schema compliance.
 * Extracts the fixing logic from aas-editor.tsx so it can be reused.
 */

const ns31 = "https://admin-shell.io/aas/3/1";

interface FixDescription {
  element: string;
  issue: string;
  fix: string;
}

interface FixXmlResult {
  xml: string;
  fixCount: number;
  fixes: FixDescription[];
  success: boolean;
  error?: string;
}

/**
 * Fix XML to make it compliant with AAS 3.1 schema.
 * Returns the fixed XML string and details of all fixes applied.
 */
export function fixXml(inputXml: string): FixXmlResult {
  if (!inputXml || inputXml.trim().length === 0) {
    return { xml: inputXml, fixCount: 0, fixes: [], success: false, error: "Empty XML input" };
  }

  let xml = inputXml.trim();
  let fixCount = 0;
  const fixes: FixDescription[] = [];

  // Helper to add fix description
  const addFix = (element: string, issue: string, fix: string) => {
    fixes.push({ element, issue, fix });
    fixCount++;
  };

  // Pass 0: Upgrade namespace from 3.0 to 3.1 if needed
  const ns30Patterns = [
    /https:\/\/admin-shell\.io\/aas\/3\/0/gi,
    /admin-shell\.io\/aas\/3\/0/gi,
  ];
  ns30Patterns.forEach(pattern => {
    if (pattern.test(xml)) {
      xml = xml.replace(pattern, (match) => match.replace(/3\/0/, "3/1"));
      addFix("namespace", "AAS 3.0 namespace detected", "Upgraded to AAS 3.1 namespace");
    }
  });

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    return { xml: inputXml, fixCount: 0, fixes: [], success: false, error: "Unable to parse XML" };
  }

  const ns = doc.documentElement.namespaceURI || ns31;
  const create = (local: string) => doc.createElementNS(ns, local);

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
    // Remove double underscores (e.g., SkillReference__00__ -> SkillReference00)
    s = s.replace(/__+/g, "");
    // Handle single-character axis identifiers (x, y, z) -> AxisX, AxisY, AxisZ
    if (/^[xyzXYZ]$/.test(s)) {
      s = "Axis" + s.toUpperCase();
    }
    if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
    s = s.replace(/-+$/, "");
    if (!s) s = "X1";
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

    // 1) Empty <value/>: choose placeholder based on context
    if (ln === "value" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const parent = el.parentElement;
      const context = findNearestIdShort(el) || parent?.localName || "unknown";
      let placeholder = "—";
      if (parent?.localName === "file") {
        placeholder = "https://example.com/aas/123";
      } else {
        const vtEl = parent?.getElementsByTagName("valueType")?.[0];
        const vtText = vtEl?.textContent?.trim()?.toLowerCase();
        if (vtText === "xs:anyuri") {
          placeholder = "https://example.com/aas/123";
        }
      }
      el.textContent = placeholder;
      addFix(`value (${context})`, "Empty value element", `Set to "${placeholder}"`);
    }

    // 2) displayName must have langStringNameType
    if (ln === "displayName" && el.children.length === 0) {
      const context = findNearestIdShort(el) || "unknown";
      const block = create("langStringNameType");
      const language = create("language");
      language.textContent = "en";
      const text = create("text");
      text.textContent = findNearestIdShort(el) || "Display Name";
      block.appendChild(language);
      block.appendChild(text);
      el.appendChild(block);
      addFix(`displayName (${context})`, "Missing langStringNameType wrapper", "Added langStringNameType with default text");
    }

    // 3) description must have langStringTextType
    if (ln === "description" && el.children.length === 0) {
      const context = findNearestIdShort(el) || "unknown";
      const block = create("langStringTextType");
      const language = create("language");
      language.textContent = "en";
      const text = create("text");
      text.textContent = "—";
      block.appendChild(language);
      block.appendChild(text);
      el.appendChild(block);
      addFix(`description (${context})`, "Missing langStringTextType wrapper", "Added langStringTextType with placeholder");
    }

    // 4) embeddedDataSpecifications empty or invalid -> remove
    if (ln === "embeddedDataSpecifications") {
      // Must contain at least one valid embeddedDataSpecification child
      const hasValidChild = Array.from(el.children).some((c) => c.localName === "embeddedDataSpecification");
      if (!hasValidChild) {
        const context = findNearestIdShort(el) || "unknown";
        el.parentElement?.removeChild(el);
        addFix(`embeddedDataSpecifications (${context})`, "No valid embeddedDataSpecification children", "Removed invalid element");
      }
    }

    // 5) definition under IEC61360 must contain langStringDefinitionTypeIec61360
    if (ln === "definition" && el.children.length === 0 && isUnderIec61360(el)) {
      const context = findNearestIdShort(el) || "unknown";
      const block = create("langStringDefinitionTypeIec61360");
      const language = create("language");
      language.textContent = "en";
      const text = create("text");
      text.textContent = "—";
      block.appendChild(language);
      block.appendChild(text);
      el.appendChild(block);
      addFix(`definition (${context})`, "Missing IEC61360 definition wrapper", "Added langStringDefinitionTypeIec61360");
    }

    // 6) valueReferencePairs: if empty, remove its parent valueList
    if (ln === "valueReferencePairs") {
      const hasChildPair = Array.from(el.children).some((c) => c.localName === "valueReferencePair");
      if (!hasChildPair) {
        const context = findNearestIdShort(el) || "unknown";
        const parent = el.parentElement;
        if (parent?.localName === "valueList") {
          parent.parentElement?.removeChild(parent);
        } else {
          el.parentElement?.removeChild(el);
        }
        addFix(`valueReferencePairs (${context})`, "Empty container", "Removed empty element");
      }
    }

    // 7) valueList with no valueReferencePairs -> remove
    if (ln === "valueList") {
      const hasVrp = Array.from(el.children).some((c) => c.localName === "valueReferencePairs");
      if (!hasVrp) {
        const context = findNearestIdShort(el) || "unknown";
        el.parentElement?.removeChild(el);
        addFix(`valueList (${context})`, "Empty container", "Removed empty element");
      }
    }

    // 8) preferredName under IEC61360 must have langStringPreferredNameTypeIec61360
    if (ln === "preferredName" && el.children.length === 0 && isUnderIec61360(el)) {
      const context = findNearestIdShort(el) || "unknown";
      const block = create("langStringPreferredNameTypeIec61360");
      const language = create("language");
      language.textContent = "en";
      const text = create("text");
      text.textContent = findNearestIdShort(el) || "Name";
      block.appendChild(language);
      block.appendChild(text);
      el.appendChild(block);
      addFix(`preferredName (${context})`, "Missing IEC61360 preferredName wrapper", "Added langStringPreferredNameTypeIec61360");
    }

    // 9) keys must contain at least one key
    if (ln === "keys") {
      const hasKey = Array.from(el.children).some((c) => c.localName === "key");
      if (!hasKey) {
        const context = findNearestIdShort(el) || el.parentElement?.localName || "unknown";
        const key = create("key");
        const typeEl = create("type");
        const valueEl = create("value");
        const parentName = el.parentElement?.localName;
        if (parentName === "semanticId" || parentName === "dataSpecification") {
          typeEl.textContent = "GlobalReference";
        } else if (parentName === "reference") {
          typeEl.textContent = "Submodel";
        } else {
          typeEl.textContent = "GlobalReference";
        }
        valueEl.textContent = "https://example.com/aas/123";
        key.appendChild(typeEl);
        key.appendChild(valueEl);
        el.appendChild(key);
        addFix(`keys (${context})`, "Empty keys container", "Added placeholder key element");
      }
    }

    // 10) Individual key elements must have both type and value children
    if (ln === "key") {
      const children = Array.from(el.children);
      const hasType = children.some((c) => c.localName === "type");
      const hasValue = children.some((c) => c.localName === "value");
      const context = findNearestIdShort(el) || "unknown";

      if (!hasType) {
        const typeEl = create("type");
        typeEl.textContent = "GlobalReference";
        const valueChild = children.find((c) => c.localName === "value");
        if (valueChild) {
          el.insertBefore(typeEl, valueChild);
        } else {
          el.appendChild(typeEl);
        }
        addFix(`key (${context})`, "Missing type element", "Added type=GlobalReference");
      }

      if (!hasValue) {
        const valueEl = create("value");
        valueEl.textContent = "https://example.com/aas/123";
        el.appendChild(valueEl);
        addFix(`key (${context})`, "Missing value element", "Added placeholder value");
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
      addFix(`specificAssetIds (${nearest})`, "Empty container", `Added specificAssetId with name="${nearest}", value="${gai}"`);
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
      addFix(`specificAssetId (${nameText})`, "Missing value element", `Added value="${gai}"`);
    } else if (!valueChild.textContent?.trim()) {
      // Empty value element - fill it
      const nearest = findNearestIdShort(sai) || "asset";
      const nameText = nameChild?.textContent?.trim() || nearest;
      const gai = getGlobalAssetId() || nameText;
      valueChild.textContent = gai;
      addFix(`specificAssetId (${nameText})`, "Empty value", `Set value="${gai}"`);
    }
  });

  // Pass 3: assetType must be non-empty
  Array.from(doc.getElementsByTagName("assetType")).forEach((el) => {
    const txt = el.textContent?.trim() || "";
    if (txt.length === 0) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "Product";
      addFix(`assetType (${context})`, "Empty value", "Set to 'Product'");
    }
  });

  // Pass 4: conceptDescriptions container — remove if empty
  Array.from(doc.getElementsByTagName("conceptDescriptions")).forEach((cds) => {
    const hasAny = Array.from(cds.children).some((c) => c.localName === "conceptDescription");
    if (!hasAny) {
      cds.parentElement?.removeChild(cds);
      addFix("conceptDescriptions", "Empty container", "Removed empty element");
    }
  });

  // Pass 4b: Fix incomplete key elements (must have type and value with content)
  const allKeyElements = Array.from(doc.querySelectorAll("*")).filter(el => el.localName === "key");

  allKeyElements.forEach((keyEl) => {
    const children = Array.from(keyEl.children);
    let typeChild = children.find((c) => c.localName === "type") as Element | undefined;
    let valueChild = children.find((c) => c.localName === "value") as Element | undefined;
    const context = findNearestIdShort(keyEl) || "unknown";

    // Add missing type
    if (!typeChild) {
      typeChild = create("type");
      typeChild.textContent = "GlobalReference";
      if (valueChild) {
        keyEl.insertBefore(typeChild, valueChild);
      } else {
        keyEl.appendChild(typeChild);
      }
      addFix(`key (${context})`, "Missing type element", "Added type='GlobalReference'");
    } else if (!typeChild.textContent?.trim()) {
      typeChild.textContent = "GlobalReference";
      addFix(`key (${context})`, "Empty type element", "Set to 'GlobalReference'");
    }

    // Add missing value
    if (!valueChild) {
      valueChild = create("value");
      valueChild.textContent = "https://example.com/aas/123";
      keyEl.appendChild(valueChild);
      addFix(`key (${context})`, "Missing value element", "Added placeholder value");
    } else if (!valueChild.textContent?.trim()) {
      valueChild.textContent = "https://example.com/aas/123";
      addFix(`key (${context})`, "Empty value element", "Set to 'https://example.com/aas/123'");
    }
  });

  // Pass 4c: globalAssetId must not be empty (minLength 1)
  Array.from(doc.getElementsByTagName("globalAssetId")).forEach((el) => {
    if (!el.textContent?.trim()) {
      const context = findNearestIdShort(el) || "asset";
      el.textContent = `https://example.com/asset/${context}`;
      addFix(`globalAssetId (${context})`, "Empty value", `Set to 'https://example.com/asset/${context}'`);
    }
  });

  // Pass 4d: unit must not be empty if present (minLength 1) - remove if empty
  Array.from(doc.getElementsByTagName("unit")).forEach((el) => {
    if (!el.textContent?.trim()) {
      el.parentElement?.removeChild(el);
      addFix("unit", "Empty value", "Removed empty element");
    }
  });

  // Pass 4e: version must match pattern (0|[1-9][0-9]*) - set to "1" if empty/invalid
  Array.from(doc.getElementsByTagName("version")).forEach((el) => {
    const val = el.textContent?.trim() || "";
    if (!val || !/^(0|[1-9][0-9]*)$/.test(val)) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "1";
      addFix(`version (${context})`, val ? `Invalid pattern: "${val}"` : "Empty value", "Set to '1'");
    }
  });

  // Pass 4f: revision must match pattern (0|[1-9][0-9]*) - set to "0" if empty/invalid
  Array.from(doc.getElementsByTagName("revision")).forEach((el) => {
    const val = el.textContent?.trim() || "";
    if (!val || !/^(0|[1-9][0-9]*)$/.test(val)) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "0";
      addFix(`revision (${context})`, val ? `Invalid pattern: "${val}"` : "Empty value", "Set to '0'");
    }
  });

  // Pass 4g: isCaseOf must have reference child - remove if empty
  Array.from(doc.getElementsByTagName("isCaseOf")).forEach((el) => {
    const hasReference = Array.from(el.children).some((c) => c.localName === "reference");
    if (!hasReference) {
      el.parentElement?.removeChild(el);
      const context = findNearestIdShort(el) || "unknown";
      addFix(`isCaseOf (${context})`, "Missing reference child", "Removed empty element");
    }
  });

  // Pass 4h: id elements must not be empty (minLength 1)
  Array.from(doc.getElementsByTagName("id")).forEach((el) => {
    // Skip if parent is a "key" element (those are handled separately)
    if (el.parentElement?.localName === "key") return;
    if (!el.textContent?.trim()) {
      const context = findNearestIdShort(el) || "element";
      el.textContent = `https://example.com/aas/${context}`;
      addFix(`id (${context})`, "Empty value", `Set to 'https://example.com/aas/${context}'`);
    }
  });

  // Pass 5: normalize all idShort values to match pattern
  Array.from(doc.getElementsByTagName("idShort")).forEach((idEl) => {
    const raw = idEl.textContent || "";
    const cleaned = sanitizeIdShort(raw);
    if (cleaned !== raw) {
      idEl.textContent = cleaned;
      addFix(`idShort`, `Invalid pattern: "${raw}"`, `Sanitized to "${cleaned}"`);
    }
  });

  // Pass 6: Add placeholder operationVariable to empty Operation variable containers
  ["inputVariables", "outputVariables", "inoutputVariables"].forEach((localName) => {
    Array.from(doc.getElementsByTagName(localName)).forEach((container) => {
      const hasOpVar = Array.from(container.children).some((c) => c.localName === "operationVariable");
      if (!hasOpVar) {
        const context = findNearestIdShort(container) || "unknown";
        // Add a placeholder operationVariable with a minimal property
        const opVar = create("operationVariable");
        const value = create("value");
        const property = create("property");
        const idShort = create("idShort");
        idShort.textContent = "placeholder";
        const valueType = create("valueType");
        valueType.textContent = "xs:string";
        property.appendChild(idShort);
        property.appendChild(valueType);
        value.appendChild(property);
        opVar.appendChild(value);
        container.appendChild(opVar);
        addFix(`${localName} (${context})`, "Empty container", "Added placeholder operationVariable");
      }
    });
  });

  // Pass 7: remove empty submodelElements containers
  Array.from(doc.getElementsByTagName("submodelElements")).forEach((container) => {
    const allowed = new Set([
      "relationshipElement", "annotatedRelationshipElement", "basicEventElement",
      "blob", "capability", "entity", "file", "multiLanguageProperty",
      "operation", "property", "range", "referenceElement",
      "submodelElementCollection", "submodelElementList"
    ]);
    const hasAny = Array.from(container.children).some((c) => allowed.has(c.localName));
    if (!hasAny) {
      const context = findNearestIdShort(container) || "unknown";
      container.parentElement?.removeChild(container);
      addFix(`submodelElements (${context})`, "Empty container", "Removed empty element");
    }
  });

  // Pass 8: sanitize all <language> values
  Array.from(doc.getElementsByTagName("language")).forEach((langEl) => {
    const raw = (langEl.textContent || "").trim();
    const isValid = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/.test(raw);
    if (!isValid || raw.length === 0) {
      const context = findNearestIdShort(langEl) || "unknown";
      langEl.textContent = "en";
      addFix(`language (${context})`, raw ? `Invalid value: "${raw}"` : "Empty value", "Set to 'en'");
    }
  });

  // Pass 9: ensure non-empty <text> in any langString* blocks
  Array.from(doc.getElementsByTagName("text")).forEach((textEl) => {
    const parent = textEl.parentElement;
    const isLangString = !!parent && parent.localName.toLowerCase().startsWith("langstring");
    const raw = (textEl.textContent || "").trim();
    if (isLangString && raw.length === 0) {
      const context = findNearestIdShort(textEl) || parent?.localName || "unknown";
      textEl.textContent = "—";
      addFix(`text (${context})`, "Empty text in langString", "Set to placeholder '—'");
    }
  });

  // Pass 10: remove defaultThumbnail if path is empty
  Array.from(doc.getElementsByTagName("defaultThumbnail")).forEach((thumbEl) => {
    const pathEl = Array.from(thumbEl.children).find((c) => c.localName === "path");
    const contentEl = Array.from(thumbEl.children).find((c) => c.localName === "contentType");
    const pathTxt = (pathEl?.textContent || "").trim();
    const contentTxt = (contentEl?.textContent || "").trim();
    if (!pathEl || pathTxt.length === 0 || (contentEl && contentTxt.length === 0)) {
      const context = findNearestIdShort(thumbEl) || "unknown";
      thumbEl.parentElement?.removeChild(thumbEl);
      addFix(`defaultThumbnail (${context})`, "Empty or invalid path/contentType", "Removed element");
    }
  });

  // Pass 11: Remove empty qualifiers containers
  const qualifiersToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "qualifiers") {
      const hasQualifier = Array.from(el.children).some((c) => c.localName === "qualifier");
      if (!hasQualifier) {
        qualifiersToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  qualifiersToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`qualifiers (${context})`, "Empty container", "Removed empty element");
  });

  // Pass 12: Remove empty statements containers
  const statementsToRemove: { el: Element; context: string }[] = [];
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
        statementsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  statementsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`statements (${context})`, "Empty container", "Removed empty element");
  });

  // Pass 13: Fix value elements in SubmodelElementCollection/SubmodelElementList
  const collectionParentTags = new Set(["submodelElementCollection", "submodelElementList"]);
  const allowedValueChildren = new Set([
    "relationshipElement", "annotatedRelationshipElement", "basicEventElement",
    "blob", "capability", "entity", "file", "multiLanguageProperty",
    "operation", "property", "range", "referenceElement",
    "submodelElementCollection", "submodelElementList"
  ]);
  const valuesToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((parent) => {
    if (collectionParentTags.has(parent.localName)) {
      const context = findNearestIdShort(parent) || parent.localName;
      Array.from(parent.children).forEach((child) => {
        if (child.localName === "value") {
          const hasAllowedChild = Array.from(child.children).some((c) => allowedValueChildren.has(c.localName));
          const hasTextContent = (child.textContent || "").trim().length > 0 && child.children.length === 0;

          if (hasTextContent && !hasAllowedChild) {
            child.textContent = "";
            addFix(`value (${context})`, "Text content in collection value", "Cleared invalid text content");
          }

          if (child.children.length === 0 && (child.textContent || "").trim().length === 0) {
            valuesToRemove.push({ el: child, context });
          }
        }
      });
    }
  });
  valuesToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`value (${context})`, "Empty value in collection", "Removed empty element");
  });

  // Pass 14: Remove empty extensions containers
  const extensionsToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "extensions") {
      const hasExtension = Array.from(el.children).some((c) => c.localName === "extension");
      if (!hasExtension) {
        extensionsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  extensionsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`extensions (${context})`, "Empty container", "Removed empty element");
  });

  // Pass 15: Remove empty supplementalSemanticIds containers
  const supplementalToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "supplementalSemanticIds") {
      const hasRef = Array.from(el.children).some((c) => c.localName === "reference");
      if (!hasRef) {
        supplementalToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  supplementalToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`supplementalSemanticIds (${context})`, "Empty container", "Removed empty element");
  });

  // Pass 16: Second pass to catch any remaining empty containers
  const emptyContainersToRemove: { el: Element; context: string }[] = [];
  const emptyContainerNames = new Set(["qualifiers", "statements", "extensions", "supplementalSemanticIds"]);
  doc.querySelectorAll("*").forEach((el) => {
    if (emptyContainerNames.has(el.localName) && el.children.length === 0) {
      emptyContainersToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  emptyContainersToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`${el.localName} (${context})`, "Empty container (2nd pass)", "Removed empty element");
  });

  // Pass 17: Fix shortName under IEC61360 (must have langStringShortNameTypeIec61360)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "shortName" && el.children.length === 0 && isUnderIec61360(el)) {
      const context = findNearestIdShort(el) || "unknown";
      const block = create("langStringShortNameTypeIec61360");
      const language = create("language");
      language.textContent = "en";
      const text = create("text");
      text.textContent = findNearestIdShort(el) || "—";
      block.appendChild(language);
      block.appendChild(text);
      el.appendChild(block);
      addFix(`shortName (${context})`, "Missing IEC61360 shortName wrapper", "Added langStringShortNameTypeIec61360");
    }
  });

  // Pass 18: Remove empty unit elements (or fill with placeholder)
  const unitsToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "unit" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      // In IEC61360, empty unit is invalid - remove it
      if (isUnderIec61360(el)) {
        unitsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  unitsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`unit (${context})`, "Empty unit in IEC61360", "Removed empty element");
  });

  // Pass 19: Remove empty valueFormat elements
  const valueFormatsToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "valueFormat" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      valueFormatsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  valueFormatsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`valueFormat (${context})`, "Empty valueFormat", "Removed empty element");
  });

  // Pass 20: Remove empty annotations containers
  const annotationsToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "annotations") {
      const hasContent = Array.from(el.children).some((c) =>
        ["dataElement", "property", "multiLanguageProperty", "range", "blob", "file", "referenceElement"].includes(c.localName)
      );
      if (!hasContent) {
        annotationsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  annotationsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`annotations (${context})`, "Empty annotations container", "Removed empty element");
  });

  // Pass 21: Fix empty semanticId elements (must have type and keys)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "semanticId") {
      const children = Array.from(el.children);
      const hasType = children.some((c) => c.localName === "type");
      const hasKeys = children.some((c) => c.localName === "keys");
      const context = findNearestIdShort(el) || "unknown";

      // If semanticId is empty or missing required children, add them
      if (!hasType && !hasKeys && el.children.length === 0) {
        const typeEl = create("type");
        typeEl.textContent = "ExternalReference";
        el.appendChild(typeEl);

        const keysEl = create("keys");
        const keyEl = create("key");
        const keyType = create("type");
        keyType.textContent = "GlobalReference";
        const keyValue = create("value");
        keyValue.textContent = "https://example.com/aas/123";
        keyEl.appendChild(keyType);
        keyEl.appendChild(keyValue);
        keysEl.appendChild(keyEl);
        el.appendChild(keysEl);
        addFix(`semanticId (${context})`, "Empty semanticId", "Added type and keys structure");
      } else if (hasType && !hasKeys) {
        // Has type but no keys - add keys
        const keysEl = create("keys");
        const keyEl = create("key");
        const keyType = create("type");
        keyType.textContent = "GlobalReference";
        const keyValue = create("value");
        keyValue.textContent = "https://example.com/aas/123";
        keyEl.appendChild(keyType);
        keyEl.appendChild(keyValue);
        keysEl.appendChild(keyEl);
        el.appendChild(keysEl);
        addFix(`semanticId (${context})`, "Missing keys element", "Added keys with placeholder");
      }
    }
  });

  // Pass 22: Fix empty reference elements (must have type and keys)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "reference") {
      const children = Array.from(el.children);
      const hasType = children.some((c) => c.localName === "type");
      const hasKeys = children.some((c) => c.localName === "keys");
      const context = findNearestIdShort(el) || "unknown";

      if (!hasType && el.children.length > 0) {
        // Has some children but no type - add type
        const typeEl = create("type");
        typeEl.textContent = "ExternalReference";
        el.insertBefore(typeEl, el.firstChild);
        addFix(`reference (${context})`, "Missing type element", "Added type='ExternalReference'");
      }

      if (!hasKeys && el.children.length > 0) {
        // Has some children but no keys - add keys
        const keysEl = create("keys");
        const keyEl = create("key");
        const keyType = create("type");
        keyType.textContent = "GlobalReference";
        const keyValue = create("value");
        keyValue.textContent = "https://example.com/aas/123";
        keyEl.appendChild(keyType);
        keyEl.appendChild(keyValue);
        keysEl.appendChild(keyEl);
        el.appendChild(keysEl);
        addFix(`reference (${context})`, "Missing keys element", "Added keys with placeholder");
      }
    }
  });

  // Pass 23: Remove empty dataType elements under IEC61360
  const dataTypesToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "dataType" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "") && isUnderIec61360(el)) {
      dataTypesToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  dataTypesToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`dataType (${context})`, "Empty dataType in IEC61360", "Removed empty element");
  });

  // Pass 24: Remove empty levelType elements
  const levelTypesToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "levelType" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      levelTypesToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  levelTypesToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`levelType (${context})`, "Empty levelType", "Removed empty element");
  });

  // Pass 25: Remove empty sourceOfDefinition elements
  const sourceOfDefinitionToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "sourceOfDefinition" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      sourceOfDefinitionToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  sourceOfDefinitionToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`sourceOfDefinition (${context})`, "Empty sourceOfDefinition", "Removed empty element");
  });

  // Pass 26: Remove empty symbol elements
  const symbolsToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "symbol" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      symbolsToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
    }
  });
  symbolsToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`symbol (${context})`, "Empty symbol", "Removed empty element");
  });

  // Pass 27: Remove empty isCaseOf containers
  const isCaseOfToRemove: { el: Element; context: string }[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "isCaseOf") {
      const hasReference = Array.from(el.children).some((c) => c.localName === "reference");
      if (!hasReference && el.children.length === 0) {
        isCaseOfToRemove.push({ el, context: findNearestIdShort(el) || "unknown" });
      }
    }
  });
  isCaseOfToRemove.forEach(({ el, context }) => {
    el.parentElement?.removeChild(el);
    addFix(`isCaseOf (${context})`, "Empty isCaseOf container", "Removed empty element");
  });

  // Pass 28: Fix empty observed element in BasicEventElement (must have type and keys)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "observed" && el.children.length === 0) {
      const parent = el.parentElement;
      if (parent?.localName === "basicEventElement") {
        const context = findNearestIdShort(el) || "unknown";
        // Add required structure
        const typeEl = create("type");
        typeEl.textContent = "ModelReference";
        el.appendChild(typeEl);

        const keysEl = create("keys");
        const keyEl = create("key");
        const keyType = create("type");
        keyType.textContent = "Referable";
        const keyValue = create("value");
        keyValue.textContent = "https://example.com/aas/123";
        keyEl.appendChild(keyType);
        keyEl.appendChild(keyValue);
        keysEl.appendChild(keyEl);
        el.appendChild(keysEl);
        addFix(`observed (${context})`, "Empty observed in BasicEventElement", "Added type and keys structure");
      }
    }
  });

  // Pass 29: Remove empty entityType elements or fill with default
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "entityType" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const context = findNearestIdShort(el) || "unknown";
      // entityType must have a value - set to CoManagedEntity as default
      el.textContent = "CoManagedEntity";
      addFix(`entityType (${context})`, "Empty entityType", "Set to 'CoManagedEntity'");
    }
  });

  // Pass 30: Fix direction/state in BasicEventElement
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "basicEventElement") {
      const children = Array.from(el.children);
      let directionEl = children.find((c) => c.localName === "direction") as Element | undefined;
      let stateEl = children.find((c) => c.localName === "state") as Element | undefined;
      const context = findNearestIdShort(el) || "unknown";

      // If direction is empty, set default
      if (directionEl && (!directionEl.textContent || directionEl.textContent.trim() === "")) {
        directionEl.textContent = "output";
        addFix(`direction (${context})`, "Empty direction in BasicEventElement", "Set to 'output'");
      }

      // If state is empty, set default
      if (stateEl && (!stateEl.textContent || stateEl.textContent.trim() === "")) {
        stateEl.textContent = "on";
        addFix(`state (${context})`, "Empty state in BasicEventElement", "Set to 'on'");
      }
    }
  });

  // Pass 31: Fix empty version elements (must match pattern (0|[1-9][0-9]*))
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "version" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "1";
      addFix(`version (${context})`, "Empty version element", "Set to '1'");
    }
  });

  // Pass 32: Fix empty revision elements (must match pattern (0|[1-9][0-9]*))
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "revision" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "0";
      addFix(`revision (${context})`, "Empty revision element", "Set to '0'");
    }
  });

  // Pass 33: Fix empty id elements (must have minLength of 1)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "id" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      // Generate a placeholder ID based on parent context
      const parent = el.parentElement;
      const context = findNearestIdShort(el) || parent?.localName || "unknown";
      let placeholder = "https://example.com/aas/123";
      if (parent?.localName === "assetAdministrationShell") {
        placeholder = "urn:aas:placeholder:" + Date.now();
      } else if (parent?.localName === "submodel") {
        const idShort = findNearestIdShort(el) || "submodel";
        placeholder = "urn:submodel:" + idShort;
      } else if (parent?.localName === "conceptDescription") {
        placeholder = "urn:concept:placeholder";
      }
      el.textContent = placeholder;
      addFix(`id (${context})`, "Empty id element", `Set to '${placeholder}'`);
    }
  });

  // Pass 34: Fix empty globalAssetId elements (must have minLength of 1)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "globalAssetId" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "https://example.com/aas/123";
      addFix(`globalAssetId (${context})`, "Empty globalAssetId element", "Set to 'https://example.com/aas/123'");
    }
  });

  // Pass 35: Fix empty contentType elements (must match MIME type pattern)
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "contentType" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
      const context = findNearestIdShort(el) || "unknown";
      el.textContent = "application/octet-stream";
      addFix(`contentType (${context})`, "Empty contentType element", "Set to 'application/octet-stream'");
    }
  });

  // Pass 36: Fix globalAssetId with keys structure or attributes (should be simple string value)
  // Schema expects: <globalAssetId>urn:example:123</globalAssetId>
  // Not: <globalAssetId keys="..."> or <globalAssetId><keys>...</keys></globalAssetId>
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "globalAssetId") {
      const context = findNearestIdShort(el) || "unknown";
      let extractedValue: string | null = null;
      let needsFix = false;

      // Check for 'keys' attribute on globalAssetId itself
      const keysAttr = el.getAttribute("keys");
      if (keysAttr) {
        el.removeAttribute("keys");
        needsFix = true;
      }

      // Check for 'type' attribute on globalAssetId (shouldn't have one)
      const typeAttr = el.getAttribute("type");
      if (typeAttr) {
        el.removeAttribute("type");
        needsFix = true;
      }

      // Check for child elements (like <keys>)
      if (el.children.length > 0) {
        needsFix = true;
        const keysEl = Array.from(el.children).find((c) => c.localName === "keys");
        if (keysEl) {
          const keyEl = Array.from(keysEl.children).find((c) => c.localName === "key");
          if (keyEl) {
            // Check for value as child element
            const valueEl = Array.from(keyEl.children).find((c) => c.localName === "value");
            if (valueEl && valueEl.textContent?.trim()) {
              extractedValue = valueEl.textContent.trim();
            }
            // Check for value as attribute (fallback)
            if (!extractedValue && keyEl.getAttribute("value")) {
              extractedValue = keyEl.getAttribute("value");
            }
          }
        }
        // Clear all children
        while (el.firstChild) {
          el.removeChild(el.firstChild);
        }
      }

      // If we need to fix and there's no good value, set a placeholder
      if (needsFix) {
        const currentText = el.textContent?.trim() || "";
        el.textContent = extractedValue || currentText || "https://example.com/aas/123";
        addFix(`globalAssetId (${context})`, "Had invalid keys/type structure", `Fixed to simple string value`);
      }
    }
  });

  // Pass 37: Fix key elements that have type/value as attributes instead of child elements
  // Schema expects: <key><type>GlobalReference</type><value>urn:example</value></key>
  // Not: <key type="GlobalReference" value="urn:example"/>
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "key") {
      const typeAttr = el.getAttribute("type");
      const valueAttr = el.getAttribute("value");

      if (typeAttr || valueAttr) {
        const context = findNearestIdShort(el) || "unknown";
        const children = Array.from(el.children);
        const hasTypeChild = children.some((c) => c.localName === "type");
        const hasValueChild = children.some((c) => c.localName === "value");

        // Remove attributes
        if (typeAttr) el.removeAttribute("type");
        if (valueAttr) el.removeAttribute("value");

        // Add type child if needed
        if (!hasTypeChild) {
          const typeEl = create("type");
          typeEl.textContent = typeAttr || "GlobalReference";
          const firstChild = el.firstChild;
          if (firstChild) {
            el.insertBefore(typeEl, firstChild);
          } else {
            el.appendChild(typeEl);
          }
        }

        // Add value child if needed
        if (!hasValueChild) {
          const valueEl = create("value");
          valueEl.textContent = valueAttr || "https://example.com/aas/123";
          el.appendChild(valueEl);
        }

        addFix(`key (${context})`, "Had type/value as attributes", "Converted to child elements");
      }
    }
  });

  // Pass 38: Remove semanticId from ReferenceElement's value element
  // In AAS 3.1, ReferenceElement's value should only contain type and keys, not semanticId
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "referenceElement") {
      const valueEl = Array.from(el.children).find((c) => c.localName === "value");
      if (valueEl) {
        const semanticIdInValue = Array.from(valueEl.children).find((c) => c.localName === "semanticId");
        if (semanticIdInValue) {
          const context = findNearestIdShort(el) || "unknown";
          valueEl.removeChild(semanticIdInValue);
          addFix(`semanticId (${context})`, "semanticId not allowed in ReferenceElement value", "Removed from value element");
        }
      }
    }
  });

  // Pass 39: Remove embeddedDataSpecifications from elements that shouldn't have them
  // In AAS 3.1, embeddedDataSpecifications is only allowed on: AssetAdministrationShell, Submodel, ConceptDescription
  // It is NOT allowed on any SubmodelElement types
  const allowedWithEDS = new Set(["assetAdministrationShell", "submodel", "conceptDescription", "environment"]);
  doc.querySelectorAll("*").forEach((el) => {
    if (el.localName === "embeddedDataSpecifications") {
      const parent = el.parentElement;
      if (parent && !allowedWithEDS.has(parent.localName)) {
        const context = findNearestIdShort(el) || parent.localName;
        parent.removeChild(el);
        addFix(`embeddedDataSpecifications (${context})`, `Not allowed in ${parent.localName}`, "Removed from element");
      }
    }
  });

  let fixed = new XMLSerializer().serializeToString(doc);

  // Post-processing: Use string-based regex to remove empty containers that DOM manipulation missed
  const emptyContainerPatterns = [
    /<([a-zA-Z0-9_-]+:)?qualifiers[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?qualifiers>/gi,
    /<([a-zA-Z0-9_-]+:)?qualifiers\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?statements[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?statements>/gi,
    /<([a-zA-Z0-9_-]+:)?statements\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?extensions[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?extensions>/gi,
    /<([a-zA-Z0-9_-]+:)?extensions\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?supplementalSemanticIds[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?supplementalSemanticIds>/gi,
    /<([a-zA-Z0-9_-]+:)?supplementalSemanticIds\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?value[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?value>/gi,
    /<([a-zA-Z0-9_-]+:)?value\s*\/>/gi,
    // Additional empty elements
    /<([a-zA-Z0-9_-]+:)?annotations[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?annotations>/gi,
    /<([a-zA-Z0-9_-]+:)?annotations\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?isCaseOf[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?isCaseOf>/gi,
    /<([a-zA-Z0-9_-]+:)?isCaseOf\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?unit[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?unit>/gi,
    /<([a-zA-Z0-9_-]+:)?unit\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?valueFormat[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?valueFormat>/gi,
    /<([a-zA-Z0-9_-]+:)?valueFormat\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?dataType[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?dataType>/gi,
    /<([a-zA-Z0-9_-]+:)?dataType\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?levelType[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?levelType>/gi,
    /<([a-zA-Z0-9_-]+:)?levelType\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?sourceOfDefinition[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?sourceOfDefinition>/gi,
    /<([a-zA-Z0-9_-]+:)?sourceOfDefinition\s*\/>/gi,
    /<([a-zA-Z0-9_-]+:)?symbol[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?symbol>/gi,
    /<([a-zA-Z0-9_-]+:)?symbol\s*\/>/gi,
    // embeddedDataSpecifications must contain embeddedDataSpecification children
    /<([a-zA-Z0-9_-]+:)?embeddedDataSpecifications[^>]*>\s*<\/([a-zA-Z0-9_-]+:)?embeddedDataSpecifications>/gi,
    /<([a-zA-Z0-9_-]+:)?embeddedDataSpecifications\s*\/>/gi,
  ];

  let prevLength = fixed.length;
  let iterations = 0;
  const maxIterations = 10;

  do {
    prevLength = fixed.length;
    emptyContainerPatterns.forEach((pattern) => {
      const before = fixed.length;
      fixed = fixed.replace(pattern, '');
      if (fixed.length < before) {
        // Extract element name from pattern for logging
        const match = pattern.source.match(/([a-zA-Z]+)/);
        const elementName = match ? match[1] : "element";
        addFix(`${elementName} (regex cleanup)`, "Empty container in serialized XML", "Removed via post-processing");
      }
    });
    iterations++;
  } while (fixed.length < prevLength && iterations < maxIterations);

  // Note: We removed the aggressive value text cleanup pattern that was incorrectly
  // removing <value> elements inside <key> elements. The DOM-based cleanup in Pass 13
  // handles SubmodelElementCollection/List values properly by checking parent context.

  const withHeader = fixed.startsWith("<?xml") ? fixed : `<?xml version="1.0" encoding="UTF-8"?>\n${fixed}`;

  return { xml: withHeader, fixCount, fixes, success: true };
}

/**
 * Fix JSON environment object for AAS 3.1 compliance
 */
export function fixJsonEnvironment(env: any): { env: any; fixCount: number } {
  if (!env) return { env, fixCount: 0 };

  let fixCount = 0;
  const idShortPattern = /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]$|^[A-Za-z]$/;

  function sanitizeIdShort(val: string): string {
    let s = (val || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
    // Remove double underscores (e.g., SkillReference__00__ -> SkillReference00)
    s = s.replace(/__+/g, "");
    // Handle single-character axis identifiers (x, y, z) -> AxisX, AxisY, AxisZ
    if (/^[xyzXYZ]$/.test(s)) {
      s = "Axis" + s.toUpperCase();
    }
    if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
    s = s.replace(/[_-]+$/, "");
    if (!s) s = "X1";
    if (!idShortPattern.test(s)) {
      if (!/[A-Za-z0-9]$/.test(s)) s = s + "1";
      if (!idShortPattern.test(s)) s = "X1";
    }
    return s;
  }

  function walk(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(walk);
    }
    if (obj && typeof obj === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "idShort" && typeof v === "string") {
          const cleaned = sanitizeIdShort(v);
          if (cleaned !== v) fixCount++;
          out[k] = cleaned;
        } else if (k === "qualifiers" && Array.isArray(v) && v.length === 0) {
          // Remove empty qualifiers
          fixCount++;
          continue;
        } else if (k === "statements" && Array.isArray(v) && v.length === 0) {
          // Remove empty statements
          fixCount++;
          continue;
        } else if (k === "extensions" && Array.isArray(v) && v.length === 0) {
          // Remove empty extensions
          fixCount++;
          continue;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return obj;
  }

  const fixed = walk(JSON.parse(JSON.stringify(env)));
  return { env: fixed, fixCount };
}
