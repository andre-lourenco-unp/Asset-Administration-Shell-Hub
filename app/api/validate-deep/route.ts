import { NextRequest, NextResponse } from "next/server";
import { validateDeep } from "@/lib/aas-deep-validator";

/**
 * POST /api/validate-deep
 *
 * Deep AAS JSON validation — single source of truth for both the Hub UI
 * and the Python aas-crew agents.
 *
 * Request body: raw AAS JSON object (Content-Type: application/json)
 *
 * Response:
 * {
 *   "valid": boolean,
 *   "errors":   [ { "path": "...", "message": "...", "severity": "error"   } ],
 *   "warnings": [ { "path": "...", "message": "...", "severity": "warning" } ],
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
        {
          valid: false,
          errors: [{ path: "/", message: "Content-Type must be application/json", severity: "error" }],
          warnings: [],
          summary: null,
        },
        { status: 400 },
      );
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        {
          valid: false,
          errors: [{ path: "/", message: "Invalid JSON in request body", severity: "error" }],
          warnings: [],
          summary: null,
        },
        { status: 400 },
      );
    }

    const result = validateDeep(data);

    return NextResponse.json(result, { status: result.valid ? 200 : 422 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        valid: false,
        errors: [{ path: "/", message: `Server error: ${message}`, severity: "error" }],
        warnings: [],
        summary: null,
      },
      { status: 500 },
    );
  }
}
