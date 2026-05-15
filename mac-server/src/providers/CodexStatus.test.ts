import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandRunner, CommandRunOptions, CommandResult } from "./CommandRunner.js";
import { checkCodexStatus } from "./CodexStatus.js";

describe("checkCodexStatus", () => {
  it("reports available Codex status without reading auth files", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "/opt/homebrew/bin/codex\n", exitCode: 0 },
      { stdout: "Logged in\n", exitCode: 0 }
    ]);

    const status = await checkCodexStatus({ commandRunner: runner, timeoutMs: 500 });

    assert.equal(status.available, true);
    assert.equal(status.commandPath, "/opt/homebrew/bin/codex");
    assert.equal(status.loginStatus, "ok");
    assert.deepEqual(runner.calls.map((call) => [call.command, call.args]), [
      ["which", ["codex"]],
      ["codex", ["login", "status"]]
    ]);
  });

  it("stops after which codex when the CLI is missing", async () => {
    const runner = new FakeCommandRunner([
      { stderr: "codex not found\n", exitCode: 1 }
    ]);

    const status = await checkCodexStatus({ commandRunner: runner, timeoutMs: 500 });

    assert.equal(status.available, false);
    assert.equal(status.loginStatus, "unknown");
    assert.equal(status.checks.length, 1);
    assert.match(status.detail, /not found/i);
  });

  it("keeps login failures structured", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "/usr/local/bin/codex\n", exitCode: 0 },
      { stderr: "Not logged in\n", exitCode: 1 }
    ]);

    const status = await checkCodexStatus({ commandRunner: runner, timeoutMs: 500 });

    assert.equal(status.available, true);
    assert.equal(status.loginStatus, "needs_attention");
    assert.match(status.detail, /Not logged in/);
  });

  it("redacts token-shaped text from status output", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "/usr/local/bin/codex\n", exitCode: 0 },
      { stdout: "Logged in using an API key - sk-fake-***EXAMPLE\n", exitCode: 0 }
    ]);

    const status = await checkCodexStatus({ commandRunner: runner, timeoutMs: 500 });

    assert.equal(status.loginStatus, "ok");
    assert.doesNotMatch(status.checks[1]?.output ?? "", /sk-/i);
    assert.match(status.checks[1]?.output ?? "", /\[redacted-api-key\]/);
  });

  it("redacts bearer-token-shaped status output", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "/usr/local/bin/codex\n", exitCode: 0 },
      { stderr: "Authorization: Bearer secret-token-1234567890\n", exitCode: 1 }
    ]);

    const status = await checkCodexStatus({ commandRunner: runner, timeoutMs: 500 });

    assert.equal(status.loginStatus, "needs_attention");
    assert.doesNotMatch(status.checks[1]?.output ?? "", /secret-token-1234567890/);
    assert.match(status.checks[1]?.output ?? "", /Bearer \[redacted-token\]/);
  });
});

interface FakeResponse {
  stdout?: string;
  stderr?: string;
  exitCode: number | null;
  timedOut?: boolean;
}

class FakeCommandRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; options: CommandRunOptions }> = [];

  constructor(private readonly responses: FakeResponse[]) {}

  async run(command: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const response = this.responses.shift() ?? { stdout: "", exitCode: 1 };

    return {
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
      exitCode: response.exitCode,
      timedOut: response.timedOut ?? false
    };
  }
}
