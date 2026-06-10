import { createRequire } from "node:module";
import path from "node:path";

import { Language, Parser, type Tree } from "web-tree-sitter";

import type { SourceFile, SupportedLanguage } from "./types.js";

const require = createRequire(import.meta.url);

const languageByExtension: Record<string, SupportedLanguage | undefined> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
};

const wasmByLanguage: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
};

let parserInit: Promise<void> | undefined;
const languageCache = new Map<SupportedLanguage, Promise<Language>>();

export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  return languageByExtension[path.extname(filePath).toLowerCase()];
}

export async function parseSourceFile(file: SourceFile): Promise<Tree | null> {
  await ensureParserInitialized();
  const parser = new Parser();

  try {
    parser.setLanguage(await loadLanguage(file.language));
    return parser.parse(file.content);
  } finally {
    parser.delete();
  }
}

async function loadLanguage(language: SupportedLanguage): Promise<Language> {
  let cached = languageCache.get(language);
  if (!cached) {
    cached = loadLanguageFromWasm(language);
    languageCache.set(language, cached);
  }

  return cached;
}

async function loadLanguageFromWasm(language: SupportedLanguage): Promise<Language> {
  await ensureParserInitialized();

  const wasmRoot = path.join(path.dirname(require.resolve("@vscode/tree-sitter-wasm/package.json")), "wasm");
  return Language.load(path.join(wasmRoot, wasmByLanguage[language]));
}

async function ensureParserInitialized(): Promise<void> {
  if (!parserInit) {
    const runtimeWasm = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
    parserInit = Parser.init({ locateFile: () => runtimeWasm });
  }

  await parserInit;
}
