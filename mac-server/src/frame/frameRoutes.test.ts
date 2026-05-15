import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server.js";
import { MockTutorProvider } from "../providers/MockTutorProvider.js";
import { InMemoryTutorStateStore } from "../session/TutorStateStore.js";
import { FrameStore } from "./FrameStore.js";

describe("frame routes", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp(new MockTutorProvider(), new InMemoryTutorStateStore("frame-session"), {
      frameStore: new FrameStore({ saveFrames: false })
    });
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, () => resolve(listener));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("returns manual_text_required when no text or marker is supplied", async () => {
    const response = await post("/frame", {
      dataUrl: "data:text/plain;base64,aGVsbG8="
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.type, "manual_text_required");
    assert.equal(response.body.frame.saved, false);
  });

  it("rejects a frame upload without frame data", async () => {
    const response = await post("/frame", {});

    assert.equal(response.status, 400);
    assert.equal(response.body.type, "error");
    assert.match(response.body.answer, /frame data is required/i);
  });

  it("creates a detected question when manual region text and marker are supplied", async () => {
    const response = await post("/frame", {
      dataUrl: "data:text/plain;base64,aGVsbG8=",
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.detectedQuestion.marker, "?");
    assert.equal(response.body.tutorResponse.type, "intent_options");
  });

  async function post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    return {
      status: response.status,
      body: await response.json()
    };
  }
});
