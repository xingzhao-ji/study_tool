import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { describe, it } from "node:test";
import { FrameStore } from "./FrameStore.js";

describe("FrameStore", () => {
  it("does not save uploaded frame bytes by default", async () => {
    const store = new FrameStore({ saveFrames: false });
    const record = await store.store({
      dataUrl: "data:text/plain;base64,aGVsbG8="
    });

    assert.equal(record.saved, false);
    assert.equal(record.path, undefined);
  });

  it("saves uploaded frame bytes when explicitly enabled", async () => {
    const rootDir = ".tmp/test-frames";
    await mkdir(rootDir, { recursive: true });
    const store = new FrameStore({ saveFrames: true, rootDir });
    const record = await store.store({
      dataUrl: "data:text/plain;base64,aGVsbG8="
    });

    assert.equal(record.saved, true);
    assert.ok(record.path);
    assert.equal(existsSync(record.path), true);
  });
});
