import type { Message } from "../agent/types.js";

export interface ModelRequestOptions {
  signal?: AbortSignal;
}

export interface Model {
  generate(messages: Message[], options?: ModelRequestOptions): Promise<string>;
  stream(messages: Message[], options?: ModelRequestOptions): AsyncIterable<string>;
}
