export type SupportedLanguage = "typescript" | "tsx" | "javascript" | "jsx" | "python" | "go" | "rust";

export interface SourceFile {
  absolutePath: string;
  relativePath: string;
  language: SupportedLanguage;
  content: string;
}

export type SymbolKind = "class" | "function" | "interface" | "type" | "method" | "struct" | "enum" | "trait" | "impl";

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string;
}

export interface FileAnalysis {
  file: SourceFile;
  symbols: CodeSymbol[];
  imports: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface DependencyGraph {
  nodes: Set<string>;
  edges: GraphEdge[];
  fileNodes: Set<string>;
  symbolNodes: Set<string>;
}

export interface RankedNode {
  id: string;
  score: number;
}

export interface TokenCounter {
  count(text: string): number;
}
