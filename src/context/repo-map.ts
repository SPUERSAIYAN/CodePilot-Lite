import { buildDependencyGraph } from "./graph.js";
import { parseSourceFile } from "./languages.js";
import { rankGraph } from "./rank.js";
import { renderBudgetedRepoMap } from "./budget.js";
import { scanRepository } from "./scanner.js";
import { analyzeFile } from "./symbols.js";
import { createTokenCounter } from "./token-counter.js";
import type { TokenCounter } from "./types.js";

export interface RepoMapService {
  getRepoMap(): Promise<string>;
  markDirty(): void;
}

export interface RepoMapOptions {
  rootDir: string;
  enabled: boolean;
  maxTokens: number;
  tokenCounter?: TokenCounter;
}

export function createRepoMapService(options: RepoMapOptions): RepoMapService {
  return new DefaultRepoMapService(options);
}

class DefaultRepoMapService implements RepoMapService {
  private cachedRepoMap: string | undefined;
  private dirty = true;
  private readonly tokenCounter: TokenCounter;

  constructor(private readonly options: RepoMapOptions) {
    this.tokenCounter = options.tokenCounter ?? createTokenCounter();
  }

  async getRepoMap(): Promise<string> {
    if (!this.options.enabled) {
      return "Repo Map disabled.";
    }

    if (!this.dirty && this.cachedRepoMap !== undefined) {
      return this.cachedRepoMap;
    }

    this.cachedRepoMap = await this.build();
    this.dirty = false;
    return this.cachedRepoMap;
  }

  markDirty(): void {
    this.dirty = true;
  }

  private async build(): Promise<string> {
    const files = await scanRepository(this.options.rootDir);
    const analyses = await Promise.all(files.map(async (file) => analyzeFile(file, await parseSourceFile(file))));
    const graph = buildDependencyGraph(analyses);
    const ranks = rankGraph(graph);

    return renderBudgetedRepoMap({
      analyses,
      graph,
      ranks,
      maxTokens: this.options.maxTokens,
      tokenCounter: this.tokenCounter,
    });
  }
}
