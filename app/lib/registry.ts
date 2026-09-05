import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const COMPILED_DIRECTORY = path.join(ROOT, "compiled");
const SOURCES_DIRECTORY = path.join(ROOT, "sources");
const REGISTRIES_DIRECTORY = path.join(ROOT, "registries");
const RELATIONSHIPS_DIRECTORY = path.join(ROOT, "relationships");

type ApprovedFolder = "compiled" | "sources" | "registries" | "relationships";

function isSafeFileName(file: string): boolean {
  return path.basename(file) === file;
}

export function readJsonFrom<T = any>(folder: ApprovedFolder, file: string): T | null {
  if (!isSafeFileName(file)) return null;

  try {
    switch (folder) {
      case "compiled":
        return JSON.parse(fs.readFileSync(path.join(COMPILED_DIRECTORY, file), "utf8")) as T;
      case "sources":
        return JSON.parse(fs.readFileSync(path.join(SOURCES_DIRECTORY, file), "utf8")) as T;
      case "registries":
        return JSON.parse(fs.readFileSync(path.join(REGISTRIES_DIRECTORY, file), "utf8")) as T;
      case "relationships":
        return JSON.parse(fs.readFileSync(path.join(RELATIONSHIPS_DIRECTORY, file), "utf8")) as T;
    }
  } catch {
    return null;
  }
}

export function masterRegistry() {
  return readJsonFrom<any>("compiled", "master-registry.json") ?? { entities: [], relationships: [] };
}

export function deduplicationReport() {
  return readJsonFrom<any>("compiled", "deduplication-report.json") ?? {};
}

export function sourceDefinitions() {
  if (!fs.existsSync(SOURCES_DIRECTORY)) return [];

  return fs.readdirSync(SOURCES_DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .map((file) => {
      const source = readJsonFrom<any>("sources", file);
      return source ? { file, ...source } : { file, name: file, status: "invalid" };
    });
}
