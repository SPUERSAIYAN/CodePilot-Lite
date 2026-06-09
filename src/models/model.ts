import type { Message } from "../agent/types.js";

export interface Model {
  generate(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
}
