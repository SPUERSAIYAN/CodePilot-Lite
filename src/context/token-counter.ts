import { fromPreTrained } from "@lenml/tokenizer-deepseek_v4";

import type { TokenCounter } from "./types.js";

export function createTokenCounter(): TokenCounter {
  try {
    const tokenizer: TokenizerLike = fromPreTrained() as TokenizerLike;

    return {
      count(text: string): number {
        const encoded = tokenizer.encode(text);
        return Array.isArray(encoded) ? encoded.length : approximateTokenCount(text);
      },
    };
  } catch {
    return { count: approximateTokenCount };
  }
}

interface TokenizerLike {
  encode(text: string): unknown;
}

function approximateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
