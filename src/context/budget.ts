import type { DependencyGraph, FileAnalysis, RankedNode, TokenCounter } from "./types.js";
import { fileId, parseFileId } from "./graph.js";

export interface RenderRepoMapInput {
  analyses: FileAnalysis[];
  graph: DependencyGraph;
  ranks: RankedNode[];
  maxTokens: number;
  tokenCounter: TokenCounter;
}

export function renderBudgetedRepoMap(input: RenderRepoMapInput): string {
  const lines = renderLines(input);
  const selected: string[] = [];

  for (const line of lines) {
    const candidate = [...selected, line].join("\n");
    if (input.tokenCounter.count(candidate) > input.maxTokens) {
      if (line.startsWith("## ") || selected.length === 0) {
        selected.push(line);
      }
      continue;
    }

    selected.push(line);
  }

  return hardTrim(selected.join("\n").trimEnd(), input.maxTokens, input.tokenCounter);
}

function renderLines(input: RenderRepoMapInput): string[] {
  const analysesByPath = new Map(input.analyses.map((analysis) => [analysis.file.relativePath, analysis]));
  const fileRank = input.ranks
    .filter((rank) => input.graph.fileNodes.has(rank.id))
    .map((rank) => parseFileId(rank.id));
  const symbolRank = new Map(input.ranks.map((rank, index) => [rank.id, index]));
  const lines = ["## Repo Map", "", "### High-value files"];

  for (const filePath of preferRootFiles(fileRank)) {
    const analysis = analysesByPath.get(filePath);
    if (!analysis) {
      continue;
    }

    lines.push(`- ${filePath}`);
    for (const symbol of [...analysis.symbols].sort(
      (left, right) => (symbolRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (symbolRank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    )) {
      lines.push(`  - L${symbol.startLine}-${symbol.endLine} ${symbol.kind} ${symbol.name}: ${symbol.signature}`);
    }
  }

  lines.push("", "### Dependencies");
  const dependencyLines = input.graph.edges
    .filter((edge) => input.graph.fileNodes.has(edge.from) && input.graph.fileNodes.has(edge.to))
    .map((edge) => `- ${parseFileId(edge.from)} -> ${parseFileId(edge.to)}`)
    .sort();

  lines.push(...new Set(dependencyLines));
  lines.push("", "### Reading guidance", "- Use this map to choose likely files, then call read_file for exact code before editing.");

  return lines;
}

function preferRootFiles(paths: string[]): string[] {
  const preferred = ["package.json", "tsconfig.json", "src/index.ts"];
  const pathSet = new Set(paths);
  const ordered = preferred.filter((filePath) => pathSet.has(filePath));

  for (const filePath of paths) {
    if (!ordered.includes(filePath)) {
      ordered.push(filePath);
    }
  }

  return ordered;
}

function hardTrim(text: string, maxTokens: number, tokenCounter: TokenCounter): string {
  if (tokenCounter.count(text) <= maxTokens) {
    return text;
  }

  const lines = text.split("\n");
  while (lines.length > 1 && tokenCounter.count(lines.join("\n")) > maxTokens) {
    lines.pop();
  }

  const trimmed = lines.join("\n").trimEnd();
  return tokenCounter.count(trimmed) <= maxTokens ? trimmed : "";
}

export function analysisPathId(analysis: FileAnalysis): string {
  return fileId(analysis.file.relativePath);
}
