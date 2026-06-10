import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfigFromEnv } from "../../src/config/env.js";
import { createRepoMapService } from "../../src/context/repo-map.js";
import { scanRepository } from "../../src/context/scanner.js";
import { createTokenCounter } from "../../src/context/token-counter.js";
import { createPromptService } from "../../src/prompts/index.js";

test("loadConfigFromEnv derives repo map defaults from the context window", () => {
  const config = loadConfigFromEnv({
    DEEPSEEK_API_KEY: "key",
    DEEPSEEK_CONTEXT_WINDOW_TOKENS: "1000",
  });

  assert.equal(config.repoMapEnabled, true);
  assert.equal(config.repoMapTokenRatio, 0.1);
  assert.equal(config.repoMapMaxTokens, 100);
});

test("loadConfigFromEnv lets max tokens override the ratio-derived budget", () => {
  const config = loadConfigFromEnv({
    DEEPSEEK_API_KEY: "key",
    DEEPSEEK_CONTEXT_WINDOW_TOKENS: "1000",
    REPO_MAP_TOKEN_RATIO: "0.5",
    REPO_MAP_MAX_TOKENS: "42",
    REPO_MAP_ENABLED: "false",
  });

  assert.equal(config.repoMapEnabled, false);
  assert.equal(config.repoMapTokenRatio, 0.5);
  assert.equal(config.repoMapMaxTokens, 42);
});

test("scanRepository skips dependency and sensitive paths", async () => {
  await withFixture(async (root) => {
    await writeFixture(root, "src/index.ts", "export function main() {}\n");
    await writeFixture(root, "node_modules/pkg/index.ts", "export function ignored() {}\n");
    await writeFixture(root, "src/secret-helper.ts", "export function ignored() {}\n");
    await writeFixture(root, ".env", "DEEPSEEK_API_KEY=secret\n");

    const files = await scanRepository(root);

    assert.deepEqual(files.map((file) => file.relativePath), ["src/index.ts"]);
  });
});

test("repo map extracts symbols, ranks connected files, and respects token budget", async () => {
  await withFixture(async (root) => {
    await writeFixture(
      root,
      "src/index.ts",
      [
        'import { runAgent } from "./agent/loop.js";',
        "",
        "export function main() {",
        '  return runAgent("task");',
        "}",
        "",
      ].join("\n"),
    );
    await writeFixture(
      root,
      "src/agent/loop.ts",
      [
        "export class DefaultAgent {",
        "  run() { return parseAgentAction('{}'); }",
        "}",
        "",
        "export function runAgent(task: string) {",
        "  return new DefaultAgent().run();",
        "}",
        "",
      ].join("\n"),
    );
    await writeFixture(root, "src/agent/parser.ts", "export function parseAgentAction(value: string) { return value; }\n");
    await writeFixture(root, "isolated.ts", "export function lonely() { return 1; }\n");

    const service = createRepoMapService({
      rootDir: root,
      enabled: true,
      maxTokens: 180,
      tokenCounter: createTokenCounter(),
    });

    const repoMap = await service.getRepoMap();

    assert.match(repoMap, /## Repo Map/);
    assert.match(repoMap, /src\/index\.ts/);
    assert.match(repoMap, /function main/);
    assert.match(repoMap, /class DefaultAgent/);
    assert.match(repoMap, /src\/index\.ts -> src\/agent\/loop\.ts/);
    assert.ok(createTokenCounter().count(repoMap) <= 180);

    const connectedIndex = repoMap.indexOf("src/agent/loop.ts");
    const isolatedIndex = repoMap.indexOf("isolated.ts");
    assert.ok(connectedIndex !== -1);
    assert.ok(isolatedIndex === -1 || connectedIndex < isolatedIndex);
  });
});

test("repo map service rebuilds after being marked dirty", async () => {
  await withFixture(async (root) => {
    await writeFixture(root, "src/index.ts", "export function before() {}\n");

    const service = createRepoMapService({
      rootDir: root,
      enabled: true,
      maxTokens: 200,
      tokenCounter: createTokenCounter(),
    });

    const before = await service.getRepoMap();
    await writeFixture(root, "src/index.ts", "export function after() {}\n");
    const stale = await service.getRepoMap();
    service.markDirty();
    const after = await service.getRepoMap();

    assert.match(before, /before/);
    assert.equal(stale, before);
    assert.match(after, /after/);
  });
});

test("system prompt includes the rendered repo map", async () => {
  const promptService = await createPromptService();
  const systemPrompt = promptService.renderSystemPrompt({
    cwd: "repo",
    platform: "win32",
    maxSteps: 10,
    repoMap: "## Repo Map\n- src/index.ts",
  });

  assert.match(systemPrompt, /## 仓库地图/);
  assert.match(systemPrompt, /## Repo Map\n- src\/index\.ts/);
});

async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-map-"));

  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeFixture(root: string, relativePath: string, content: string): Promise<void> {
  const targetPath = path.join(root, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}
