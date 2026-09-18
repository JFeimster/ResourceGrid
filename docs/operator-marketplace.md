# Operator Marketplace

ResourceGrid is the canonical capability registry. Operator Marketplace is the discovery, packaging, recommendation, API, and MCP layer.

## Architecture

`packages/marketplace/<slug>/capability.json + optional SKILL.md -> marketplace registry -> UI / packages / adapters / MCP / REST`

The package is the source of truth. Registry shards can be regenerated with `npm run marketplace:build`.

## Package states

- `canonical` — full instruction source is present in ResourceGrid.
- `composed` — Operator Pack instructions compose existing component capabilities.
- `source-unavailable` — provenance is known, but the original local-only instructions have not yet been materialized. The API exposes a transparent shell instead of pretending full instructions exist.

## Commands

- `npm run marketplace:build`
- `npm run marketplace:validate`
- `npm run marketplace:check`

## Routes

- `/marketplace`
- `/marketplace/[slug]`
- `/api/v1/plugins`
- `/api/v1/plugins/[slug]`
- `/api/v1/packages/[platform]/[slug]`
- `/api/v1/adapters/[platform]/[slug]`
- `/api/v1/recommend`
- `/api/v1/openapi`
- `/api/mcp`

## MCP tools

- `marketplace.search`
- `marketplace.get`
- `marketplace.adapter`
- `marketplace.package`
- `marketplace.recommend`

Only user-owned/custom assets are publishable. Third-party inventories are not republished automatically.
