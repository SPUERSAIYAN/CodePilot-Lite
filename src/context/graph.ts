import path from "node:path";

import type { DependencyGraph, FileAnalysis, GraphEdge } from "./types.js";

const importWeight = 3;
const fileSymbolWeight = 1.5;
const referenceWeight = 0.5;

export function buildDependencyGraph(analyses: FileAnalysis[]): DependencyGraph {
  const nodes = new Set<string>();
  const fileNodes = new Set<string>();
  const symbolNodes = new Set<string>();
  const edges: GraphEdge[] = [];
  const filePaths = new Set(analyses.map((analysis) => analysis.file.relativePath));
  const allSymbols = analyses.flatMap((analysis) => analysis.symbols);

  for (const analysis of analyses) {
    const fileNode = fileId(analysis.file.relativePath);
    nodes.add(fileNode);
    fileNodes.add(fileNode);

    for (const symbol of analysis.symbols) {
      nodes.add(symbol.id);
      symbolNodes.add(symbol.id);
      edges.push({ from: fileNode, to: symbol.id, weight: fileSymbolWeight });
      edges.push({ from: symbol.id, to: fileNode, weight: fileSymbolWeight });
    }

    for (const importTarget of analysis.imports) {
      const resolved = resolveImport(analysis.file.relativePath, importTarget, filePaths);
      if (resolved) {
        edges.push({ from: fileNode, to: fileId(resolved), weight: importWeight });
      }
    }

    for (const symbol of allSymbols) {
      if (symbol.filePath === analysis.file.relativePath) {
        continue;
      }

      if (containsWord(analysis.file.content, symbol.name)) {
        edges.push({ from: fileNode, to: symbol.id, weight: referenceWeight });
      }
    }
  }

  return { nodes, edges, fileNodes, symbolNodes };
}

export function fileId(relativePath: string): string {
  return `file:${relativePath}`;
}

export function parseFileId(id: string): string {
  return id.startsWith("file:") ? id.slice("file:".length) : id;
}

function resolveImport(fromFile: string, importTarget: string, filePaths: Set<string>): string | undefined {
  if (!importTarget.startsWith(".")) {
    return undefined;
  }

  const basePath = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), importTarget));
  const candidates = [
    basePath,
    replaceExtension(basePath, ".ts"),
    replaceExtension(basePath, ".tsx"),
    replaceExtension(basePath, ".js"),
    replaceExtension(basePath, ".jsx"),
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.py`,
    `${basePath}.go`,
    `${basePath}.rs`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
  ];

  return candidates.find((candidate) => filePaths.has(candidate));
}

function replaceExtension(filePath: string, extension: string): string {
  const parsed = path.posix.parse(filePath);
  return parsed.ext ? path.posix.join(parsed.dir, `${parsed.name}${extension}`) : filePath;
}

function containsWord(content: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
