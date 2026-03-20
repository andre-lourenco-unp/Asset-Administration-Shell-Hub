# AAS Hub — Asset Administration Shell Forge & Validator

A Next.js application for creating, editing, visualising, and **validating** Asset Administration Shell (AAS) files. Supports `.aasx`, `.json`, and `.xml` formats.

---

## Quick Start (Docker — recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24

### Run

```bash
docker compose up -d
```

The Hub will be available at **http://localhost:3333**.

### Rebuild after code changes

```bash
docker compose up -d --build
```

### Stop

```bash
docker compose down
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| Port mapping | `3333:3000` | Change the left-hand side in `docker-compose.yml` to use a different host port |

---

## Development (without Docker)

### Prerequisites

- Node.js ≥ 22
- npm ≥ 10

### Install & run

```bash
npm install
npm run dev -- -p 3333
```

---

## Validation API

The Hub exposes a JSON validation endpoint that can be called programmatically (e.g. by an AI agent or CI pipeline).

### `POST /api/validate`

Validates an AAS JSON payload against the AAS 3.1 structure rules (idShort pattern, top-level keys, shell/submodel object integrity).

#### Request

```
POST http://localhost:3333/api/validate
Content-Type: application/json
```

Body: the raw AAS JSON object.

```json
{
  "assetAdministrationShells": [ ... ],
  "submodels": [ ... ],
  "conceptDescriptions": [ ... ]
}
```

#### Response — Valid (`200`)

```json
{
  "valid": true,
  "errors": [],
  "summary": {
    "shells": 1,
    "submodels": 3,
    "conceptDescriptions": 0,
    "elements": 7,
    "submodelIds": ["Nameplate", "TechnicalData", "AssetInterfacesDescription"]
  }
}
```

#### Response — Invalid (`422`)

```json
{
  "valid": false,
  "errors": [
    {
      "path": "submodels[0].idShort",
      "message": "Element 'submodels[0].idShort': [facet 'pattern'] The value 'bad name' is not accepted by the pattern '[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]+'"
    }
  ],
  "summary": {
    "shells": 0,
    "submodels": 1,
    "conceptDescriptions": 0,
    "elements": 0,
    "submodelIds": ["bad name"]
  }
}
```

#### Response — Bad Request (`400`)

Returned when `Content-Type` is not `application/json` or the body is not valid JSON.

#### cURL example

```bash
curl -s -X POST http://localhost:3333/api/validate \
  -H "Content-Type: application/json" \
  -d @my_aas_output.json | python3 -m json.tool
```

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── validate/route.ts   # Validation API endpoint
│   │   └── minio/              # MinIO storage routes
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── json-validator.ts       # AAS JSON structure validator
│   ├── xml-validator.ts        # AAS XML/AASX validator
│   ├── process-file.ts         # File upload processing
│   ├── types.ts                # Shared TypeScript types
│   └── validation-types.ts     # Alert/error type definitions
├── components/                 # React UI components
├── Dockerfile                  # Multi-stage production build
├── docker-compose.yml          # Single-command container start
└── next.config.mjs             # Next.js config (standalone output)
```

---

## Tech Stack

- **Next.js 16** with App Router
- **React 18** + Radix UI + Tailwind CSS
- **TypeScript 5**
- **Docker** (node:22-alpine, multi-stage build, ~312 MB image)
