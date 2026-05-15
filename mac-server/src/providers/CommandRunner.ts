import { spawn } from "node:child_process";

export interface CommandRunOptions {
  cwd?: string;
  input?: string;
  timeoutMs: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface CommandRunner {
  run(command: string, args: string[], options: CommandRunOptions): Promise<CommandResult>;
}

export class ShellCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const finish = (result: CommandResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        finish({ stdout, stderr, exitCode, timedOut });
      });

      if (options.input) {
        child.stdin.end(options.input);
      } else {
        child.stdin.end();
      }
    });
  }
}
