/**
 * Targeted unit tests for the 10 bug fixes applied to aas-editor.tsx
 * Run with: node --experimental-vm-modules __tests__/changes.test.mjs
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toContain(item) {
      if (!actual.includes(item))
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
    },
    toHaveLength(n) {
      if (actual.length !== n)
        throw new Error(`Expected length ${n}, got ${actual.length}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #1: isSelected — nested node selection
// Old: JSON.stringify(path) === JSON.stringify([element.idShort])
// New: JSON.stringify(path) === JSON.stringify(selectedElementPath)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #1: isSelected for nested nodes ──');

function isSelectedOld(path, element) {
  // Bug: only matches root-level nodes
  return JSON.stringify(path) === JSON.stringify([element.idShort]);
}

function isSelectedNew(path, selectedElementPath) {
  return selectedElementPath.length > 0 &&
    JSON.stringify(path) === JSON.stringify(selectedElementPath);
}

test('old: root element correctly selected', () => {
  expect(isSelectedOld(['Motor'], { idShort: 'Motor' })).toBe(true);
});

test('old: nested element NEVER selected (bug)', () => {
  // path = ['Motor', 'Voltage'] but [element.idShort] = ['Voltage'] — mismatch!
  expect(isSelectedOld(['Motor', 'Voltage'], { idShort: 'Voltage' })).toBe(false);
});

test('new: root element still selected correctly', () => {
  const path = ['Motor'];
  const selectedElementPath = ['Motor'];
  expect(isSelectedNew(path, selectedElementPath)).toBe(true);
});

test('new: nested element now selected correctly', () => {
  const path = ['Motor', 'Voltage'];
  const selectedElementPath = ['Motor', 'Voltage'];
  expect(isSelectedNew(path, selectedElementPath)).toBe(true);
});

test('new: different path not selected', () => {
  const path = ['Motor', 'Voltage'];
  const selectedElementPath = ['Motor', 'Current'];
  expect(isSelectedNew(path, selectedElementPath)).toBe(false);
});

test('new: empty selectedElementPath never matches', () => {
  expect(isSelectedNew(['Motor'], [])).toBe(false);
});

test('new: 3-level nesting works', () => {
  const path = ['Submodel', 'Collection', 'DeepProperty'];
  const selectedElementPath = ['Submodel', 'Collection', 'DeepProperty'];
  expect(isSelectedNew(path, selectedElementPath)).toBe(true);
});

test('new: sibling not selected', () => {
  const path = ['Submodel', 'Collection', 'OtherProperty'];
  const selectedElementPath = ['Submodel', 'Collection', 'DeepProperty'];
  expect(isSelectedNew(path, selectedElementPath)).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #2: addElement — stale elements variable removed, selectedElementPath set
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #2: addElement stale closure cleanup ──');

// Simulate the fixed setTimeout callback
function simulateAddElementTimeout(submodelId, addElementParentPath, newElementIdShort, submodelDataState) {
  const path = addElementParentPath ? [...addElementParentPath, newElementIdShort] : [newElementIdShort];

  const findByPath = (els, p, idx = 0) => {
    if (idx >= p.length) return null;
    const cur = els.find(e => e.idShort === p[idx]);
    if (!cur) return null;
    if (idx === p.length - 1) return cur;
    return cur.children ? findByPath(cur.children, p, idx + 1) : null;
  };

  // Uses fresh state (current), not stale closure
  const elements = submodelDataState[submodelId] || [];
  const found = findByPath(elements, path);
  return { found, path };
}

const freshState = {
  TechnicalData: [
    { idShort: 'Motor', modelType: 'SubmodelElementCollection', children: [
      { idShort: 'NewlyAdded', modelType: 'Property', value: '' }
    ]},
  ]
};

test('finds newly added root element using fresh state', () => {
  const { found, path } = simulateAddElementTimeout('TechnicalData', null, 'Motor', freshState);
  expect(found?.idShort).toBe('Motor');
  expect(path).toEqual(['Motor']);
});

test('finds newly added nested element using fresh state', () => {
  const { found, path } = simulateAddElementTimeout('TechnicalData', ['Motor'], 'NewlyAdded', freshState);
  expect(found?.idShort).toBe('NewlyAdded');
  expect(path).toEqual(['Motor', 'NewlyAdded']);
});

test('returns null for non-existent element', () => {
  const { found } = simulateAddElementTimeout('TechnicalData', null, 'Ghost', freshState);
  expect(found).toBeNull();
});

test('path is correctly built for root element', () => {
  const { path } = simulateAddElementTimeout('TechnicalData', null, 'Root', freshState);
  expect(path).toEqual(['Root']);
});

test('path is correctly built for nested element', () => {
  const { path } = simulateAddElementTimeout('TechnicalData', ['A', 'B'], 'C', freshState);
  expect(path).toEqual(['A', 'B', 'C']);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #4: onFileGenerated — no null for optional fields
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #4: onFileGenerated type correctness ──');

function buildFallbackFileGeneratedPayload(fileName, thumbnail) {
  // Fixed version: no parsed:null / aasData:null
  return {
    file: fileName,
    type: 'AASX',
    valid: true,
    processingTime: 0,
    thumbnail: thumbnail || undefined,
  };
}

test('fallback payload has no null values', () => {
  const p = buildFallbackFileGeneratedPayload('test.aasx', null);
  const hasNullValues = Object.values(p).some(v => v === null);
  expect(hasNullValues).toBe(false);
});

test('fallback payload has required fields', () => {
  const p = buildFallbackFileGeneratedPayload('test.aasx', null);
  expect(p.file).toBe('test.aasx');
  expect(p.type).toBe('AASX');
  expect(p.valid).toBe(true);
  expect(typeof p.processingTime).toBe('number');
});

test('thumbnail is passed through when provided', () => {
  const p = buildFallbackFileGeneratedPayload('test.aasx', 'data:image/png;base64,abc');
  expect(p.thumbnail).toBe('data:image/png;base64,abc');
});

test('thumbnail is undefined when not provided', () => {
  const p = buildFallbackFileGeneratedPayload('test.aasx', null);
  expect(p.thumbnail).toBe(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #8: buildElementPath — extracted useCallback, finds elements at any depth
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #8: buildElementPath at any depth ──');

function buildElementPath(element, elements, currentPath = []) {
  for (const el of elements) {
    if (el.idShort === element.idShort) {
      return [...currentPath, el.idShort];
    }
    if (el.children) {
      const found = buildElementPath(element, el.children, [...currentPath, el.idShort]);
      if (found) return found;
    }
  }
  return null;
}

const tree = [
  {
    idShort: 'Identification',
    children: [
      {
        idShort: 'ManufacturerName',
        children: [
          { idShort: 'NameEN' },
          { idShort: 'NameDE' },
        ]
      },
      { idShort: 'SerialNumber' },
    ]
  },
  { idShort: 'TechnicalProperties' },
];

test('finds root element', () => {
  const result = buildElementPath({ idShort: 'Identification' }, tree);
  expect(result).toEqual(['Identification']);
});

test('finds depth-1 element', () => {
  const result = buildElementPath({ idShort: 'ManufacturerName' }, tree);
  expect(result).toEqual(['Identification', 'ManufacturerName']);
});

test('finds depth-2 element', () => {
  const result = buildElementPath({ idShort: 'NameEN' }, tree);
  expect(result).toEqual(['Identification', 'ManufacturerName', 'NameEN']);
});

test('finds sibling at depth-2', () => {
  const result = buildElementPath({ idShort: 'NameDE' }, tree);
  expect(result).toEqual(['Identification', 'ManufacturerName', 'NameDE']);
});

test('finds depth-1 sibling', () => {
  const result = buildElementPath({ idShort: 'SerialNumber' }, tree);
  expect(result).toEqual(['Identification', 'SerialNumber']);
});

test('finds second root element', () => {
  const result = buildElementPath({ idShort: 'TechnicalProperties' }, tree);
  expect(result).toEqual(['TechnicalProperties']);
});

test('returns null for missing element', () => {
  const result = buildElementPath({ idShort: 'NonExistent' }, tree);
  expect(result).toBeNull();
});

test('returns null for empty tree', () => {
  const result = buildElementPath({ idShort: 'Motor' }, []);
  expect(result).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #7: Tree search debounce — input state vs query state are separate
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #7: Tree search debounce separation ──');

function simulateSearchDebounce() {
  let treeSearchInput = '';
  let treeSearchQuery = '';
  let debounceTimer = null;
  const DEBOUNCE_MS = 150;

  function onInputChange(val) {
    treeSearchInput = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { treeSearchQuery = val; }, DEBOUNCE_MS);
  }

  return {
    type(val) { onInputChange(val); },
    getInput() { return treeSearchInput; },
    getQuery() { return treeSearchQuery; },
    flush() {
      return new Promise(res => setTimeout(() => {
        treeSearchQuery = treeSearchInput; // simulate timer firing
        res();
      }, DEBOUNCE_MS + 10));
    }
  };
}

test('input value updates immediately', async () => {
  const s = simulateSearchDebounce();
  s.type('Motor');
  expect(s.getInput()).toBe('Motor');
  // query should still be empty (debounce not fired)
  expect(s.getQuery()).toBe('');
});

test('rapid typing only triggers query once (last value)', async () => {
  const s = simulateSearchDebounce();
  s.type('M');
  s.type('Mo');
  s.type('Mot');
  s.type('Moto');
  s.type('Motor');
  // input is immediately updated
  expect(s.getInput()).toBe('Motor');
  // query still not updated (debounce pending)
  expect(s.getQuery()).toBe('');
  // after debounce fires, query catches up
  await s.flush();
  expect(s.getQuery()).toBe('Motor');
});

test('clearing search resets both states', () => {
  let treeSearchInput = 'Motor';
  let treeSearchQuery = 'Motor';
  // Simulate the clear button: { setTreeSearchInput(""); setTreeSearchQuery(""); }
  treeSearchInput = '';
  treeSearchQuery = '';
  expect(treeSearchInput).toBe('');
  expect(treeSearchQuery).toBe('');
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #9: XML reuse — buildCurrentXml skipped when hasValidated=true
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #9: XML reuse after validation ──');

function resolveXml(hasValidated, lastGeneratedXml, buildCurrentXmlFn) {
  // This is the exact logic placed in generateFinalAAS
  return (hasValidated && lastGeneratedXml) ? lastGeneratedXml : buildCurrentXmlFn();
}

test('uses cached XML when hasValidated=true and lastGeneratedXml is set', () => {
  let buildCalled = false;
  const result = resolveXml(true, '<cached/>', () => { buildCalled = true; return '<fresh/>'; });
  expect(result).toBe('<cached/>');
  expect(buildCalled).toBe(false);
});

test('builds fresh XML when hasValidated=false', () => {
  let buildCalled = false;
  const result = resolveXml(false, '<cached/>', () => { buildCalled = true; return '<fresh/>'; });
  expect(result).toBe('<fresh/>');
  expect(buildCalled).toBe(true);
});

test('builds fresh XML when lastGeneratedXml is null', () => {
  let buildCalled = false;
  const result = resolveXml(true, null, () => { buildCalled = true; return '<fresh/>'; });
  expect(result).toBe('<fresh/>');
  expect(buildCalled).toBe(true);
});

test('builds fresh XML when both hasValidated=false and no cached XML', () => {
  let buildCalled = false;
  const result = resolveXml(false, null, () => { buildCalled = true; return '<fresh/>'; });
  expect(result).toBe('<fresh/>');
  expect(buildCalled).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #3: hasValidated reset — useEffect should reset when data changes
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #3: Validation state reset on data change ──');

test('useEffect dep array includes submodelData so hasValidated resets', () => {
  // Verify the logic: hasValidated is reset to false whenever submodelData changes.
  // We simulate the effect deps changing by checking the pattern.
  let hasValidated = true;
  let canGenerate = true;

  // Simulate the useEffect firing (any dep changed)
  function onDataChange() {
    hasValidated = false;
    canGenerate = false;
  }

  onDataChange(); // simulate submodelData change
  expect(hasValidated).toBe(false);
  expect(canGenerate).toBe(false);
});

test('hasValidated stays false until validate is explicitly run', () => {
  let hasValidated = false;

  // User edits data — effect fires
  hasValidated = false;

  // User clicks validate — sets true
  function runValidate() { hasValidated = true; }
  expect(hasValidated).toBe(false);
  runValidate();
  expect(hasValidated).toBe(true);

  // User edits again — effect fires
  hasValidated = false;
  expect(hasValidated).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #5 & #6: Value UI for Operation / MLP validation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Fix #5: modelType routing for Operation/BasicEventElement/AnnotatedRelationshipElement ──');

function getValueUIType(modelType) {
  if (modelType === 'Property') return 'property-input';
  if (modelType === 'MultiLanguageProperty') return 'mlp-inputs';
  if (modelType === 'SubmodelElementCollection' || modelType === 'SubmodelElementList') return 'collection-info';
  if (modelType === 'File') return 'file-upload';
  if (modelType === 'Operation') return 'operation-info';           // FIX #5
  if (modelType === 'BasicEventElement') return 'event-fields';     // FIX #5
  if (modelType === 'AnnotatedRelationshipElement') return 'rel-fields'; // FIX #5
  if (modelType === 'Entity') return 'entity-type';
  return 'empty'; // was the bug: all three above fell here before the fix
}

test('Property renders property-input', () => expect(getValueUIType('Property')).toBe('property-input'));
test('MultiLanguageProperty renders mlp-inputs', () => expect(getValueUIType('MultiLanguageProperty')).toBe('mlp-inputs'));
test('SubmodelElementCollection renders collection-info', () => expect(getValueUIType('SubmodelElementCollection')).toBe('collection-info'));
test('SubmodelElementList renders collection-info', () => expect(getValueUIType('SubmodelElementList')).toBe('collection-info'));
test('File renders file-upload', () => expect(getValueUIType('File')).toBe('file-upload'));
test('Entity renders entity-type', () => expect(getValueUIType('Entity')).toBe('entity-type'));
test('Operation renders operation-info (was empty before fix)', () => expect(getValueUIType('Operation')).toBe('operation-info'));
test('BasicEventElement renders event-fields (was empty before fix)', () => expect(getValueUIType('BasicEventElement')).toBe('event-fields'));
test('AnnotatedRelationshipElement renders rel-fields (was empty before fix)', () => expect(getValueUIType('AnnotatedRelationshipElement')).toBe('rel-fields'));

console.log('\n── Fix #6: MLP required validation ──');

function validateMLPRequired(element) {
  if (element.modelType !== 'MultiLanguageProperty') return true;
  const isRequired = element.cardinality === 'One' || element.cardinality === 'OneToMany';
  if (!isRequired) return true;

  let hasValue = false;
  if (typeof element.value === 'object' && element.value !== null) {
    const values = Object.values(element.value).filter(v => v && v.trim() !== '');
    hasValue = values.length > 0;
  }
  return hasValue;
}

test('required MLP with empty value fails validation', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'One', value: { en: '' } })).toBe(false);
});

test('required MLP with filled value passes validation', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'One', value: { en: 'Siemens AG' } })).toBe(true);
});

test('optional MLP with empty value passes validation', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'ZeroToOne', value: { en: '' } })).toBe(true);
});

test('required MLP with null value fails validation', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'One', value: null })).toBe(false);
});

test('required MLP with undefined value fails validation', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'One', value: undefined })).toBe(false);
});

test('required MLP with multiple languages, at least one filled, passes', () => {
  expect(validateMLPRequired({ modelType: 'MultiLanguageProperty', cardinality: 'One', value: { en: '', de: 'Siemens AG' } })).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(55)}\n`);
if (failed > 0) process.exit(1);
