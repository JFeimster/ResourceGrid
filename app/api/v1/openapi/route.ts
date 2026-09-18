import { NextRequest, NextResponse } from "next/server";

const platformParameter = {
  name: "platform",
  in: "path",
  required: true,
  schema: { type: "string", enum: ["openai", "claude", "codex", "mcp", "api", "vscode", "saas"] },
};

const slugParameter = {
  name: "slug",
  in: "path",
  required: true,
  schema: { type: "string" },
};

export function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Operator Marketplace API",
      version: "1.1.0",
      description: "Canonical capability registry, install packages, deterministic recommendations, adapters, and MCP discovery.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/plugins": {
        get: {
          summary: "Search marketplace capabilities",
          parameters: ["q", "theme", "kind", "platform"].map((name) => ({
            name,
            in: "query",
            required: false,
            schema: { type: "string" },
          })),
          responses: { "200": { description: "Marketplace search results" } },
        },
      },
      "/api/v1/plugins/{slug}": {
        get: {
          summary: "Get one marketplace capability",
          parameters: [slugParameter],
          responses: {
            "200": { description: "Capability metadata and package status" },
            "404": { description: "Capability not found" },
          },
        },
      },
      "/api/v1/adapters/{platform}/{slug}": {
        get: {
          summary: "Generate a platform adapter",
          parameters: [platformParameter, slugParameter],
          responses: {
            "200": { description: "Generated adapter descriptor" },
            "400": { description: "Unsupported platform" },
            "404": { description: "Capability not found" },
            "409": { description: "Adapter not available for capability" },
          },
        },
      },
      "/api/v1/packages/{platform}/{slug}": {
        get: {
          summary: "Get an install package descriptor or package file",
          parameters: [
            platformParameter,
            slugParameter,
            { name: "file", in: "query", required: false, schema: { type: "string" } },
            { name: "download", in: "query", required: false, schema: { type: "string", enum: ["0", "1"] } },
          ],
          responses: {
            "200": { description: "Package descriptor or requested package file" },
            "400": { description: "Unsupported platform" },
            "404": { description: "Capability or package file not found" },
            "409": { description: "Package not available for capability" },
          },
        },
      },
      "/api/v1/recommend": {
        get: {
          summary: "Recommend capabilities for a goal",
          parameters: [
            { name: "goal", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 12 } },
          ],
          responses: { "200": { description: "Ranked deterministic capability recommendations" } },
        },
        post: {
          summary: "Recommend capabilities for a goal",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["goal"],
                  properties: {
                    goal: { type: "string" },
                    limit: { type: "integer", minimum: 1, maximum: 12 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Ranked deterministic capability recommendations" },
            "400": { description: "Invalid input" },
          },
        },
      },
      "/api/mcp": {
        get: {
          summary: "MCP service discovery",
          responses: { "200": { description: "MCP service metadata" } },
        },
        post: {
          summary: "Remote MCP JSON-RPC endpoint",
          responses: { "200": { description: "MCP JSON-RPC response" } },
        },
      },
    },
  });
}
