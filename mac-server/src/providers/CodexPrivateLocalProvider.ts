import type { TutorProvider, TutorRequest, TutorResponse } from "./TutorProvider.js";
import { buildCheckPrompt, buildIntentPrompt, buildTutorPrompt } from "../tutor/PromptBuilder.js";
import { ShellCommandRunner, type CommandResult, type CommandRunner } from "./CommandRunner.js";

export interface CodexPrivateLocalProviderOptions {
  commandRunner?: CommandRunner;
  timeoutMs?: number;
  cwd?: string;
  codexCommand?: string;
}

export class CodexPrivateLocalProvider implements TutorProvider {
  readonly name = "codex_private_local" as const;
  private readonly commandRunner: CommandRunner;
  private readonly timeoutMs: number;
  private readonly cwd: string;
  private readonly codexCommand: string;
  private queueTail: Promise<unknown> = Promise.resolve();

  constructor(options: CodexPrivateLocalProviderOptions = {}) {
    this.commandRunner = options.commandRunner ?? new ShellCommandRunner();
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.cwd = options.cwd ?? process.cwd();
    this.codexCommand = options.codexCommand ?? "codex";
  }

  async ask(request: TutorRequest): Promise<TutorResponse> {
    return this.enqueue(() => this.askCodex(request));
  }

  private async enqueue(task: () => Promise<TutorResponse>): Promise<TutorResponse> {
    const run = this.queueTail.then(task, task);
    this.queueTail = run.catch(() => undefined);
    return run;
  }

  private async askCodex(request: TutorRequest): Promise<TutorResponse> {
    const mode = request.marker.trim() === "?" && !request.selectedIntent ? "intent" : "answer";
    const prompt = buildCodexPrompt(request, mode);
    const result = await this.runCodex(prompt);

    if (result.timedOut) {
      return this.errorResponse("Codex CLI timed out before returning a tutor response.", {
        code: "codex_timeout",
        timeoutMs: this.timeoutMs,
        stderr: cleanCodexText(result.stderr)
      });
    }

    if (result.exitCode === null) {
      return this.errorResponse("Codex CLI could not be started. Confirm `codex` is installed and available on PATH.", {
        code: "codex_spawn_error",
        stderr: cleanCodexText(result.stderr)
      });
    }

    if (result.exitCode !== 0) {
      return this.errorResponse("Codex CLI exited with an error before returning a tutor response.", {
        code: "codex_exit_error",
        exitCode: result.exitCode,
        stderr: cleanCodexText(result.stderr)
      });
    }

    const text = cleanCodexText(result.stdout);

    if (!text) {
      return this.errorResponse("Codex CLI returned empty output.", {
        code: "codex_bad_output",
        stderr: cleanCodexText(result.stderr)
      });
    }

    if (mode === "intent") {
      const options = parseIntentOptions(text);

      if (options.length < 3) {
        return this.errorResponse("Codex CLI did not return enough intent options.", {
          code: "codex_bad_output",
          stdout: text
        });
      }

      return {
        type: "intent_options",
        options,
        provider: this.name,
        raw: {
          mode
        }
      };
    }

    return {
      type: "tutor_answer",
      answer: text,
      confidence: 0.72,
      provider: this.name,
      raw: {
        mode
      }
    };
  }

  private errorResponse(answer: string, raw: Record<string, unknown>): TutorResponse {
    return {
      type: "error",
      answer,
      provider: this.name,
      raw
    };
  }

  private async runCodex(prompt: string): Promise<CommandResult> {
    try {
      return await this.commandRunner.run(
        this.codexCommand,
        [
          "exec",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "-C",
          this.cwd,
          "-"
        ],
        {
          cwd: this.cwd,
          input: prompt,
          timeoutMs: this.timeoutMs
        }
      );
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: null,
        timedOut: false
      };
    }
  }
}

function buildCodexPrompt(request: TutorRequest, mode: "intent" | "answer"): string {
  const baseRules = [
    "You are a concise private study tutor for a Goodnotes companion app.",
    "Use only the request details below. Do not inspect files. Do not mention implementation details.",
    "Do not save or request private data.",
    "Tutor style: short, concrete, step-by-step, and do not over-solve unless asked."
  ].join("\n");

  if (mode === "intent") {
    return [
      baseRules,
      "The marker is exactly '?'. Do not answer the question directly.",
      "Return 3 to 5 likely user intentions, one per line, with no numbering or explanation.",
      buildIntentPrompt(request)
    ].join("\n\n");
  }

  const checkMarkers = new Set(["check?", "✓?", "err?"]);
  const taskPrompt = checkMarkers.has(request.marker.trim())
    ? buildCheckPrompt(request)
    : buildTutorPrompt(request);

  return [
    baseRules,
    markerInstruction(request),
    "Return only the tutor response text.",
    "If checking work, identify the first concrete issue before giving a correction.",
    taskPrompt
  ].join("\n\n");
}

function markerInstruction(request: TutorRequest): string {
  switch (request.marker.trim()) {
    case "hint?":
      return "Marker behavior: give exactly one small hint. Do not give a numbered solution or the final answer.";
    case "next?":
      return "Marker behavior: give only the next concrete step the student should do.";
    case "why?":
      return "Marker behavior: explain why the boxed statement or step is true in a short conceptual way.";
    case "check?":
    case "✓?":
      return "Marker behavior: check the work and point out the first concrete issue. Do not rewrite the full solution unless needed.";
    case "err?":
      return "Marker behavior: find the likely mistake and explain the correction briefly.";
    case "full?":
      return "Marker behavior: give the full solution only if the boxed work cannot be helped by a smaller next step.";
    case "ex?":
      return "Marker behavior: give one similar example, then stop.";
    case "simplify?":
      return "Marker behavior: explain more simply using plain language.";
    default:
      return "Marker behavior: keep the response concise and focused on the user's selected intent.";
  }
}

function cleanCodexText(text: string): string {
  const cleaned = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("WARNING:"))
    .join("\n")
    .trim();

  const fenced = cleaned.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1].trim() : cleaned;
}

function parseIntentOptions(text: string): string[] {
  const jsonOptions = parseJsonIntentOptions(text);

  if (jsonOptions.length > 0) {
    return jsonOptions;
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, ""))
    .map((line) => line.replace(/^\d+[.)]\s+/, ""))
    .map((line) => line.replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 5);
}

function parseJsonIntentOptions(text: string): string[] {
  try {
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((option): option is string => typeof option === "string")
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}
