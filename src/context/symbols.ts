import type { Node, Tree } from "web-tree-sitter";

import type { CodeSymbol, FileAnalysis, SourceFile, SymbolKind, SupportedLanguage } from "./types.js";

const symbolTypesByLanguage: Record<SupportedLanguage, Partial<Record<string, SymbolKind>>> = {
  typescript: {
    class_declaration: "class",
    function_declaration: "function",
    method_definition: "method",
    interface_declaration: "interface",
    type_alias_declaration: "type",
  },
  tsx: {
    class_declaration: "class",
    function_declaration: "function",
    method_definition: "method",
    interface_declaration: "interface",
    type_alias_declaration: "type",
  },
  javascript: {
    class_declaration: "class",
    function_declaration: "function",
    method_definition: "method",
  },
  jsx: {
    class_declaration: "class",
    function_declaration: "function",
    method_definition: "method",
  },
  python: {
    class_definition: "class",
    function_definition: "function",
  },
  go: {
    function_declaration: "function",
    method_declaration: "method",
    type_declaration: "type",
  },
  rust: {
    function_item: "function",
    struct_item: "struct",
    enum_item: "enum",
    trait_item: "trait",
    impl_item: "impl",
  },
};

export function analyzeFile(file: SourceFile, tree: Tree | null): FileAnalysis {
  if (!tree) {
    return { file, symbols: [], imports: extractImports(file) };
  }

  return {
    file,
    symbols: extractSymbols(file, tree.rootNode),
    imports: extractImports(file),
  };
}

function extractSymbols(file: SourceFile, rootNode: Node): CodeSymbol[] {
  const nodeKinds = symbolTypesByLanguage[file.language];
  const symbols: CodeSymbol[] = [];

  visit(rootNode, (node) => {
    const kind = nodeKinds[node.type];
    if (!kind) {
      return;
    }

    const name = readSymbolName(node, file.language, kind);
    if (!name) {
      return;
    }

    symbols.push({
      id: `symbol:${file.relativePath}:${name}:${node.startPosition.row + 1}`,
      name,
      kind,
      filePath: file.relativePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      signature: readSignature(node),
    });
  });

  return symbols.sort((left, right) => left.startLine - right.startLine || left.name.localeCompare(right.name));
}

function readSymbolName(node: Node, language: SupportedLanguage, kind: SymbolKind): string | undefined {
  if (language === "rust" && kind === "impl") {
    return node.childForFieldName("trait")?.text ?? node.childForFieldName("type")?.text ?? "impl";
  }

  const named = node.childForFieldName("name");
  if (named?.text) {
    return trimIdentifier(named.text);
  }

  const identifier = node.descendantsOfType(["identifier", "type_identifier", "property_identifier"])[0];
  return identifier?.text ? trimIdentifier(identifier.text) : undefined;
}

function readSignature(node: Node): string {
  return node.text.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, " ") ?? "";
}

function trimIdentifier(value: string): string {
  return value.replace(/^["'`]/, "").replace(/["'`]$/, "");
}

function extractImports(file: SourceFile): string[] {
  if (file.language === "python") {
    return collectMatches(file.content, /^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.,\s]+))/gm);
  }

  if (file.language === "go") {
    return collectMatches(file.content, /"([^"]+)"/g);
  }

  if (file.language === "rust") {
    return collectMatches(file.content, /^\s*use\s+([^;]+);/gm);
  }

  return collectMatches(file.content, /(?:import|export)\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g);
}

function collectMatches(content: string, pattern: RegExp): string[] {
  const values = new Set<string>();

  for (const match of content.matchAll(pattern)) {
    for (const value of match.slice(1)) {
      if (value?.trim()) {
        values.add(value.trim());
        break;
      }
    }
  }

  return Array.from(values).sort();
}

function visit(node: Node, visitor: (node: Node) => void): void {
  visitor(node);
  for (const child of node.namedChildren) {
    visit(child, visitor);
  }
}
