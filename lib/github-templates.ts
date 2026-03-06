/**
 * Shared GitHub template discovery with session-level caching.
 *
 * Uses a SINGLE recursive tree API call to discover all published templates
 * and their JSON file URLs. Both AAS Creator and AAS Editor import from here
 * so the data is fetched at most once per browser session.
 *
 * GitHub unauthenticated rate limit: 60 requests / hour.
 * By caching the tree data we typically use only 1 request per session.
 */

export interface TemplateInfo {
  name: string
  version: string
  description: string
  url: string
}

interface JsonMatch {
  version: number
  versionStr: string
  path: string
}

interface TreeCache {
  templates: TemplateInfo[]
  /** Map from template directory name → encoded raw.githubusercontent.com URL */
  jsonUrls: Record<string, string>
  timestamp: number
}

// Module-level cache — survives across component mounts within the same page session
let cache: TreeCache | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Rate-limit state
let rateLimitedUntil = 0 // epoch ms when the rate limit resets

/** Returns true if we're currently rate-limited. */
export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

/** Seconds until the rate limit resets (0 if not limited). */
export function rateLimitResetSeconds(): number {
  const remaining = rateLimitedUntil - Date.now()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

/**
 * Fetch all published templates and their JSON URLs.
 * Returns cached data when available. Uses a single GitHub API call.
 */
export async function fetchTemplates(): Promise<{
  templates: TemplateInfo[]
  jsonUrls: Record<string, string>
  rateLimited: boolean
}> {
  // Return cache if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return { templates: cache.templates, jsonUrls: cache.jsonUrls, rateLimited: false }
  }

  // Bail early if we know we're rate-limited
  if (isRateLimited()) {
    return {
      templates: cache?.templates ?? [],
      jsonUrls: cache?.jsonUrls ?? {},
      rateLimited: true,
    }
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/admin-shell-io/submodel-templates/git/trees/main?recursive=1"
    )

    // Track rate-limit headers
    const remaining = response.headers.get("x-ratelimit-remaining")
    const resetHeader = response.headers.get("x-ratelimit-reset")
    if (remaining === "0" && resetHeader) {
      rateLimitedUntil = parseInt(resetHeader) * 1000 // convert Unix seconds → ms
    }

    if (!response.ok) {
      const isLimit = response.status === 403 || response.status === 429
      if (isLimit && resetHeader) {
        rateLimitedUntil = parseInt(resetHeader) * 1000
      }
      return {
        templates: cache?.templates ?? [],
        jsonUrls: cache?.jsonUrls ?? {},
        rateLimited: isLimit,
      }
    }

    const data = await response.json()
    if (!Array.isArray(data.tree)) {
      return { templates: cache?.templates ?? [], jsonUrls: cache?.jsonUrls ?? {}, rateLimited: false }
    }

    // Discover template directories and their best JSON file in one pass
    const templateDirSet = new Set<string>()
    const jsonMap: Record<string, JsonMatch> = {}

    for (const entry of data.tree) {
      if (!entry.path.startsWith("published/")) continue
      const parts = entry.path.split("/")

      // Top-level template directories
      if (parts.length === 2 && entry.type === "tree") {
        templateDirSet.add(parts[1])
        continue
      }

      // Template JSON files: published/{name}/{major}/{minor}/{file}.json
      if (entry.type !== "blob") continue
      if (parts.length !== 5) continue
      if (!entry.path.endsWith(".json")) continue
      if (!entry.path.includes("Template")) continue

      const templateName = parts[1]
      const major = parseInt(parts[2])
      const minor = parseInt(parts[3])
      if (isNaN(major) || isNaN(minor)) continue

      const version = major * 1000 + minor
      const existing = jsonMap[templateName]
      // Keep latest version; prefer base files over _forAASMetamodel variants
      if (
        !existing ||
        version > existing.version ||
        (version === existing.version &&
          existing.path.includes("_forAASMetamodel") &&
          !entry.path.includes("_forAASMetamodel"))
      ) {
        jsonMap[templateName] = { version, versionStr: `${major}.${minor}`, path: entry.path }
      }
    }

    // Build templates list
    const templates: TemplateInfo[] = Array.from(templateDirSet).map((name) => ({
      name,
      version: jsonMap[name]?.versionStr || "1.0",
      description: `IDTA ${name} submodel template`,
      url: `https://github.com/admin-shell-io/submodel-templates/tree/main/published/${encodeURIComponent(name)}`,
    }))

    // Build encoded raw URLs
    const jsonUrls: Record<string, string> = {}
    for (const [name, info] of Object.entries(jsonMap)) {
      const encodedPath = info.path
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/")
      jsonUrls[name] = `https://raw.githubusercontent.com/admin-shell-io/submodel-templates/main/${encodedPath}`
    }

    // Update cache
    cache = { templates, jsonUrls, timestamp: Date.now() }

    return { templates, jsonUrls, rateLimited: false }
  } catch (error) {
    console.error("Failed to fetch GitHub templates:", error)
    return {
      templates: cache?.templates ?? [],
      jsonUrls: cache?.jsonUrls ?? {},
      rateLimited: false,
    }
  }
}

/**
 * Fetch and parse the JSON structure for a single template.
 * Uses cached jsonUrls when available; falls back to the tree API otherwise.
 * Returns parsed SubmodelElement-like objects or null.
 */
export async function fetchTemplateJson(templateName: string): Promise<any[] | null> {
  // Try cached URL first
  let rawUrl = cache?.jsonUrls?.[templateName]

  // Fallback: refresh cache (single API call) to discover the URL
  if (!rawUrl) {
    const result = await fetchTemplates()
    rawUrl = result.jsonUrls[templateName]
    if (!rawUrl) return null
  }

  try {
    // raw.githubusercontent.com is NOT rate-limited
    const res = await fetch(rawUrl)
    if (!res.ok) return null
    const data = await res.json()

    // AAS JSON package: { submodels: [{ submodelElements: [...] }] }
    const submodels = data.submodels
    if (Array.isArray(submodels)) {
      const target =
        submodels.length === 1
          ? submodels[0]
          : submodels.find((sm: any) => sm.submodelElements?.length > 0) || submodels[0]
      if (target?.submodelElements) return target.submodelElements
    }
    // Fallback: root-level submodelElements
    if (data.submodelElements) return data.submodelElements

    return null
  } catch {
    return null
  }
}
