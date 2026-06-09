export type Role = "system" | "user" | "assistant" | "tool" | "exit";

export interface Message {
  role: Role;
  content: string;
}

export type AgentAction =
  | {
      type: "shell";
      thought?: string;
      command: string;
    }
  | {
      type: "final";
      thought?: string;
      answer: string;
    };

export type AgentEvent =
  | { type: "model_start" }
  | { type: "plan"; text: string }
  | { type: "command"; command: string }
  | { type: "observation"; text: string }
  | { type: "final"; answer: string }
  | { type: "error"; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;
