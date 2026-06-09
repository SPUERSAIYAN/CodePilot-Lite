import { execa } from "execa";

const maxOutputLength = 12000;

export interface ShellResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runShell(command: string): Promise<ShellResult> {
  try {
    const result = await execa(command, {
      shell: true,
      reject: false,
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
  }
}

function truncateOutput(output: string): string {
  if (output.length <= maxOutputLength) {
    return output;
  }

  return `${output.slice(0, maxOutputLength)}\n[output truncated]`;
}
