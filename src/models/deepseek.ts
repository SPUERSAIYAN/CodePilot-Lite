import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import type { Message } from "../agent/types.js";
import type { AppConfig } from "../config/env.js";
import type { Model } from "./model.js";

export class DeepSeekModel implements Model {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: AppConfig) {
    this.client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: config.deepseekBaseUrl,
    });
    this.model = config.deepseekModel;
  }

  async generate(messages: Message[]): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: toChatMessages(messages),
    });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new Error("模型没有返回内容。");
    }

    return content;
  }

  async *stream(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: toChatMessages(messages),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}

function toChatMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "user",
        content: `工具观察：${message.content}`,
      };
    }

    if (message.role === "exit") {
      return {
        role: "assistant",
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}
