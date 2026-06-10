export type Role = "system" | "user" | "assistant" | "tool" | "exit";

export interface Message {
  role: Role;
  content: string;
}

export type ToolCommand =
  | {
      name: "list_files";
      path?: string;
    }
  | {
      name: "read_file";
      path: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      name: "search";
      query: string;
      path?: string;
    }
  | {
      name: "write_file";
      path: string;
      content: string;
    }
  | {
      name: "run_shell";
      command: string;
    };

export type AgentAction =
  | {
      type: "tool";
      thought?: string;
      command: ToolCommand;
    }
  | {
      type: "final";
      thought?: string;
      answer: string;
    };

export type AgentEvent =
  | { type: "model_start" }
  | { type: "plan"; text: string }
  | { type: "command"; command: ToolCommand }
  | { type: "observation"; text: string }
  | { type: "final"; answer: string }
  | { type: "error"; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;
