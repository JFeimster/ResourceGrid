# Operator Marketplace

ResourceGrid is the canonical capability registry. Operator Marketplace is the public discovery and adapter layer.

## Architecture

`ResourceGrid registry -> marketplace listing -> adapter generator -> OpenAI / Claude / Codex / MCP / REST / VS Code / SaaS`

The marketplace does not maintain seven separate copies of a capability. Each listing has one canonical record and one instruction payload; adapters are generated on request.

## Routes

- `/marketplace` — searchable marketplace
- `/marketplace/[slug]` — listing detail + adapter links
- `/api/v1/plugins` — queryable registry API
- `/api/v1/plugins/[slug]` — canonical public listing
- `/api/v1/adapters/[platform]/[slug]` — generated target package
- `/api/v1/openapi` — OpenAPI discovery document
- `/api/mcp` — remote MCP JSON-RPC endpoint

## MCP tools

- `marketplace.search`
- `marketplace.get`
- `marketplace.adapter`

The endpoint targets MCP protocol revision `2026-07-28` and uses stateless request/response handling.

## Publishing rule

Only user-owned/custom assets are included as publishable marketplace inventory. Third-party skill inventory may be used for internal intelligence but is not republished as marketplace content.
