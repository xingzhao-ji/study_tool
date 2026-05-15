import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandRunner, CommandRunOptions, CommandResult } from "./CommandRunner.js";
import { CodexPrivateLocalProvider } from "./CodexPrivateLocalProvider.js";

describe("CodexPrivateLocalProvider", () => {
  it("returns intent options through a fake command runner for bare question markers", async () => {
    const runner = new FakeCommandRunner([
      {
        stdout: [
          "Explain when FOLLOW includes FIRST",
          "Check whether my rule is correct",
          "Show a concrete example",
          "Give the next step only"
        ].join("\n")
      }
    ]);
    const provider = new CodexPrivateLocalProvider({ commandRunner: runner, timeoutMs: 500 });

    const response = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "intent_options");
    assert.equal(response.provider, "codex_private_local");
    assert.deepEqual(response.options, [
      "Explain when FOLLOW includes FIRST",
      "Check whether my rule is correct",
      "Show a concrete example",
      "Give the next step only"
    ]);
    assert.equal(runner.calls[0]?.command, "codex");
    assert.deepEqual(runner.calls[0]?.args.slice(0, 2), ["exec", "--ephemeral"]);
    assert.match(runner.calls[0]?.options.input ?? "", /Do not answer the question directly/);
  });

  it("returns tutor answer text through a fake command runner when intent is selected", async () => {
    const runner = new FakeCommandRunner([
      {
        stdout: "FOLLOW(A) receives FIRST(B) only when B starts the suffix after A."
      }
    ]);
    const provider = new CodexPrivateLocalProvider({ commandRunner: runner, timeoutMs: 500 });

    const response = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      selectedIntent: "Explain when FOLLOW includes FIRST",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "tutor_answer");
    assert.equal(response.provider, "codex_private_local");
    assert.match(response.answer ?? "", /receives FIRST\(B\)/);
    assert.equal(response.confidence, 0.72);
    assert.match(runner.calls[0]?.options.input ?? "", /Return only the tutor response text/);
  });

  it("returns structured timeout errors", async () => {
    const runner = new FakeCommandRunner([{ stdout: "", timedOut: true }]);
    const provider = new CodexPrivateLocalProvider({ commandRunner: runner, timeoutMs: 25 });

    const response = await provider.ask({
      regionText: "work",
      marker: "hint?"
    });

    assert.equal(response.type, "error");
    assert.equal((response.raw as { code: string }).code, "codex_timeout");
    assert.equal((response.raw as { timeoutMs: number }).timeoutMs, 25);
  });

  it("returns structured bad-output errors", async () => {
    const runner = new FakeCommandRunner([{ stdout: "   " }]);
    const provider = new CodexPrivateLocalProvider({ commandRunner: runner, timeoutMs: 500 });

    const response = await provider.ask({
      regionText: "work",
      marker: "next?"
    });

    assert.equal(response.type, "error");
    assert.equal((response.raw as { code: string }).code, "codex_bad_output");
  });

  it("queues Codex calls so only one command runs at a time", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "first answer", delayMs: 10 },
      { stdout: "second answer", delayMs: 1 }
    ]);
    const provider = new CodexPrivateLocalProvider({ commandRunner: runner, timeoutMs: 500 });

    const [first, second] = await Promise.all([
      provider.ask({ regionText: "first", marker: "hint?" }),
      provider.ask({ regionText: "second", marker: "next?" })
    ]);

    assert.equal(first.answer, "first answer");
    assert.equal(second.answer, "second answer");
    assert.equal(runner.maxActiveCalls, 1);
  });
});

interface FakeResponse {
  stdout: string;
  stderr?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  delayMs?: number;
}

class FakeCommandRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; options: CommandRunOptions }> = [];
  maxActiveCalls = 0;
  private activeCalls = 0;

  constructor(private readonly responses: FakeResponse[]) {}

  async run(command: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    this.activeCalls += 1;
    this.maxActiveCalls = Math.max(this.maxActiveCalls, this.activeCalls);
    const response = this.responses.shift() ?? { stdout: "" };

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    this.activeCalls -= 1;
    return {
      stdout: response.stdout,
      stderr: response.stderr ?? "",
      exitCode: response.exitCode ?? 0,
      timedOut: response.timedOut ?? false
    };
  }
}
