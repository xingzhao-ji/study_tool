import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

describe(".gitignore private data coverage", () => {
  it("ignores local auth, build, study data, uploads, indexes, and sqlite artifacts", async () => {
    const gitignore = await readFile(path.resolve(process.cwd(), "../.gitignore"), "utf8");
    const entries = new Set(
      gitignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    );

    for (const requiredEntry of [
      ".env",
      ".env.*",
      "auth.json",
      "*.auth.json",
      ".codex/",
      ".openclaw/",
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      ".tmp/",
      "data/",
      "data/frames/",
      "data/logs/",
      "data/sessions/",
      "data/course-files/",
      "data/course-index/",
      "data/extracted-text/",
      "data/vector-store/",
      "data/uploads/",
      "data/ocr/",
      "data/local-study-data/",
      "screenshots/",
      "captured-frames/",
      "captured_frames/",
      "ocr-logs/",
      "ocr_logs/",
      "*.sqlite",
      "*.sqlite-shm",
      "*.sqlite-wal",
      "*.ocr.log",
      "*.frame.json",
      "*.session.json"
    ]) {
      assert.ok(entries.has(requiredEntry), `expected .gitignore to include ${requiredEntry}`);
    }
  });
});
