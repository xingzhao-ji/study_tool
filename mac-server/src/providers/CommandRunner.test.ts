import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { ShellCommandRunner } from "./CommandRunner.js";

it("terminates a command that ignores SIGTERM and returns a timeout result", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "command-timeout-"));
  const pidFile = path.join(directory, "child.pid");
  let watchdog: NodeJS.Timeout | undefined;
  try {
    // The independent watchdog keeps this regression safe on the broken runner.
    const deadline = new Promise<never>((_resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error("Command did not settle after its timeout")), 2500);
    });
    const result = await Promise.race([
      new ShellCommandRunner().run(process.execPath, ["-e", `
        require('node:fs').writeFileSync(process.argv[1], String(process.pid));
        process.on('SIGTERM', () => {});
        process.stdout.write('ready');
        setInterval(() => {}, 100);
      `, pidFile], { cwd: directory, timeoutMs: 250 }),
      deadline
    ]);
    assert.equal(result.timedOut, true);
    assert.equal(result.stdout, "ready");
    assert.equal(result.exitCode, null);
  } finally {
    clearTimeout(watchdog);
    try { process.kill(Number(await readFile(pidFile, "utf8")), "SIGKILL"); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && ["ESRCH", "ENOENT"].includes(String(error.code)))) throw error;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

it("preserves stdin, stdout and successful exit status", async () => {
  const result = await new ShellCommandRunner().run(process.execPath,
    ["-e", "process.stdin.pipe(process.stdout)"],
    { cwd: process.cwd(), input: "synthetic input", timeoutMs: 2000 });
  assert.deepEqual(result, { stdout: "synthetic input", stderr: "", exitCode: 0, timedOut: false });
});
