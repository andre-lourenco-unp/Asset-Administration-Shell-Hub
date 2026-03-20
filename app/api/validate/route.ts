import { NextRequest, NextResponse } from "next/server";
import { validateAASStructure, parseAASData } from "@/lib/json-validator";

/**
 * POST /api/validate
 *
 * Validates an AAS JSON payload and returns a structured report.
 *
 * Request body: raw AAS JSON object (Content-Type: application/json)
 *
 * Response:
 * {
 *   "valid": boolean,
 *   "errors": [ { "path": "...", "message": "..." }, ... ],
 *   "summary": {
 *     "shells": number,
 *     "submodels": number,
 *     "conceptDescriptions": number,
 *     "elements": number,
 *     "submodelIds": [ "..." ]
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { valid: false, errors: [{ path: "/", message: "Content-Type must be application/json" }], summary: null },
        { status: 400 }
      );
    }

    let data: any;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { valid: false, errors: [{ path: "/", message: "Invalid JSON in request body" }], summary: null },
        { status: 400 }
      );
    }

    // Run the existing AAS structure validator
    const result = validateAASStructure(data);

    // Build a summary regardless of validity
    const parsed = parseAASData(data);

    const shells = data.assetAdministrationShells || data.shells || [];
    const submodels = data.submodels || [];
    const conceptDescriptions = data.conceptDescriptions || [];

    // Count total leaf elements across all submodels
    let totalElements = 0;
    const submodelIds: string[] = [];

    if (Array.isArray(submodels)) {
      for (const sm of submodels) {
        if (sm?.idShort) submodelIds.push(sm.idShort);
        totalElements += countElements(sm?.submodelElements);
      }
    }

    const summary = {
      shells: Array.isArray(shells) ? shells.length : 0,
      submodels: Array.isArray(submodels) ? submodels.length : 0,
      conceptDescriptions: Array.isArray(conceptDescriptions) ? conceptDescriptions.length : 0,
      elements: totalElements,
      submodelIds,
    };

    return NextResponse.json(
      { valid: result.valid, errors: result.errors, summary },
      { status: result.valid ? 200 : 422 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, errors: [{ path: "/", message: `Server error: ${err.message}` }], summary: null },
      { status: 500 }
    );
  }
}

/** Recursively count submodel elements */
function countElements(elements: any[] | undefined): number {
  if (!Array.isArray(elements)) return 0;
  let count = 0;
  for (const el of elements) {
    count++;
    // SubmodelElementCollection / SubmodelElementList have nested `value`
    if (Array.isArray(el?.value)) {
      count += countElements(el.value);
    }
  }
  return count;
}
