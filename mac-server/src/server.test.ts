import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./server.js";
import { MockTutorProvider } from "./providers/MockTutorProvider.js";

describe("mac server", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp(new MockTutorProvider());
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

  it("returns health status with the mock provider", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      service: "goodnotes-companion-tutor",
      provider: "mock"
    });
  });

  it("serves the companion UI shell", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /Goodnotes Companion Tutor/);
    assert.match(body, /id="regionText"/);
    assert.match(body, /id="marker"/);
    assert.match(body, /id="intentOptions"/);
    assert.match(body, /id="turns"/);
  });

  it("serves companion UI assets", async () => {
    const scriptResponse = await fetch(`${baseUrl}/app.js`);
    const scriptBody = await scriptResponse.text();
    const styleResponse = await fetch(`${baseUrl}/styles.css`);
    const styleBody = await styleResponse.text();

    assert.equal(scriptResponse.status, 200);
    assert.equal(styleResponse.status, 200);
    assert.match(scriptBody, /submitAsk/);
    assert.match(scriptBody, /selectedIntent/);
    assert.match(styleBody, /\.app-shell/);
    assert.match(styleBody, /\.intent-options/);
  });

  it("lists provider capabilities without enabling private local execution", async () => {
    const response = await fetch(`${baseUrl}/providers`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      activeProvider: "mock",
      providers: [
        {
          name: "mock",
          status: "available",
          description: "Rule-based local mock tutor for Milestones 0-3."
        },
        {
          name: "codex_private_local",
          status: "not_implemented",
          description: "Design placeholder only. No Codex auth, shellout, or private file access."
        }
      ]
    });
  });

  it("returns intent options for a bare question marker", async () => {
    const response = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        courseHint: "CS 132 parsing",
        nearbyContext: ""
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.type, "intent_options");
    assert.equal(body.provider, "mock");
    assert.deepEqual(body.options, [
      "Explain when FOLLOW includes FIRST",
      "Check whether my rule is correct",
      "Show a concrete example",
      "Give the next step only",
      "Find the likely misconception"
    ]);
  });

  it("returns a tutor answer when selectedIntent is provided", async () => {
    const response = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        selectedIntent: "Explain when FOLLOW includes FIRST",
        courseHint: "CS 132 parsing"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.type, "tutor_answer");
    assert.equal(body.provider, "mock");
    assert.equal(body.confidence, 0.8);
    assert.match(body.answer, /FOLLOW\(A\) can receive FIRST\(B\)/);
  });
});
