import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { detectLanguage } from "./languages.js";
import type { SourceFile } from "./types.js";

const skippedDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo"]);

export async function scanRepository(rootDir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  await scanDirectory(rootDir, rootDir, files);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function scanDirectory(rootDir: string, currentDir: string, files: SourceFile[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));

    if (isSensitivePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) {
        await scanDirectory(rootDir, absolutePath, files);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const language = detectLanguage(relativePath);
    if (!language) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath,
      language,
      content: await readFile(absolutePath, "utf8"),
    });
  }
}

function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  const parts = normalized.split("/");

  return parts.some((part) =>
    part === ".env"
    || part.endsWith(".pem")
    || part.endsWith(".key")
    || part.includes("secret")
    || part.includes("token")
  );
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
