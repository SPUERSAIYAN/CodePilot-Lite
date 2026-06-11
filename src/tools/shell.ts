import { execa } from "execa";

import { createLinkedAbortController } from "../utils/abort.js";

const maxOutputLength = 12000;

export interface ShellResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runShell(command: string, options: { signal?: AbortSignal } = {}): Promise<ShellResult> {
  const abort = createLinkedAbortController(options.signal);
  try {
    const result = await execa(command, {
      shell: true,
      reject: false,
      cancelSignal: abort.signal,
    });

    return {
      command,
      exitCode: result.exitCode ?? 0,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      command,
      exitCode: 1,
      stdout: "",
      stderr: truncateOutput(message),
    };
  } finally {
    abort.cleanup();
  }
}

function truncateOutput(output: string): string {
  if (output.length <= maxOutputLength) {
    return output;
  }

  return `${output.slice(0, maxOutputLength)}\n[output truncated]`;
}
