import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

describe("simulate script", () => {
  it("exercises the intent and follow-up check paths", async () => {
    const result = await runSimulate();

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /Intent options response/);
    assert.match(result.stdout, /Tutor answer response/);
    assert.match(result.stdout, /Follow-up check response/);
    assert.match(result.stdout, /Algebra check response/);
    assert.match(result.stdout, /should not contain ε/);
    assert.match(result.stdout, /correct so far/i);
  });
});

function runSimulate(): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/scripts/simulate.ts"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}
