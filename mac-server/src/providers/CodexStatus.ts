import { ShellCommandRunner, type CommandResult, type CommandRunner } from "./CommandRunner.js";

export type CodexLoginStatus = "ok" | "needs_attention" | "unknown";

export interface CodexStatusCheck {
  name: "which codex" | "codex login status";
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export interface CodexStatusResult {
  available: boolean;
  commandPath?: string;
  loginStatus: CodexLoginStatus;
  detail: string;
  checks: CodexStatusCheck[];
}

export interface CodexStatusOptions {
  commandRunner?: CommandRunner;
  timeoutMs?: number;
  cwd?: string;
}

export async function checkCodexStatus(options: CodexStatusOptions = {}): Promise<CodexStatusResult> {
  const commandRunner = options.commandRunner ?? new ShellCommandRunner();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const cwd = options.cwd ?? process.cwd();
  const checks: CodexStatusCheck[] = [];
  const whichCheck = await runStatusCheck(commandRunner, "which codex", "which", ["codex"], cwd, timeoutMs);
  checks.push(whichCheck);

  if (!whichCheck.ok) {
    return {
      available: false,
      loginStatus: "unknown",
      detail: "Codex CLI was not found on PATH.",
      checks
    };
  }

  const loginCheck = await runStatusCheck(
    commandRunner,
    "codex login status",
    "codex",
    ["login", "status"],
    cwd,
    timeoutMs
  );
  checks.push(loginCheck);

  return {
    available: true,
    commandPath: firstLine(whichCheck.output),
    loginStatus: loginCheck.ok ? "ok" : "needs_attention",
    detail: loginCheck.ok ? "Codex CLI is available and login status returned successfully." : loginCheck.output,
    checks
  };
}

async function runStatusCheck(
  commandRunner: CommandRunner,
  name: CodexStatusCheck["name"],
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<CodexStatusCheck> {
  try {
    const result = await commandRunner.run(command, args, { cwd, timeoutMs });
    return statusCheckFromResult(name, result);
  } catch (error) {
    return {
      name,
      ok: false,
      exitCode: null,
      timedOut: false,
      output: cleanStatusOutput(error instanceof Error ? error.message : String(error))
    };
  }
}

function statusCheckFromResult(name: CodexStatusCheck["name"], result: CommandResult): CodexStatusCheck {
  return {
    name,
    ok: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    output: cleanStatusOutput(result.stdout || result.stderr)
  };
}

function cleanStatusOutput(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map(redactSensitiveStatusText)
    .filter(Boolean)
    .slice(0, 6)
    .join("\n");
}

function redactSensitiveStatusText(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_*.-]+/g, "[redacted-api-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted-token]");
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).find(Boolean);
}
