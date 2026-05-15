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
    const app = createApp(new MockTutorProvider(), undefined, {
      codexStatusChecker: async () => ({
        available: true,
        commandPath: "/usr/local/bin/codex",
        loginStatus: "ok",
        detail: "Codex CLI is available and login status returned successfully.",
        checks: [
          {
            name: "which codex",
            ok: true,
            exitCode: 0,
            timedOut: false,
            output: "/usr/local/bin/codex"
          },
          {
            name: "codex login status",
            ok: true,
            exitCode: 0,
            timedOut: false,
            output: "Logged in"
          }
        ]
      })
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
    assert.match(body, /id="connectionProvider"/);
    assert.match(body, /id="connectionSession"/);
    assert.match(body, /id="connectionCodex"/);
    assert.match(body, /id="codexStatusButton"/);
    assert.match(body, /id="framePreview"/);
    assert.match(body, /id="uploadFrameOnlyButton"/);
    assert.match(body, /id="resetFormButton"/);
    assert.match(body, /id="copySessionButton"/);
    assert.match(body, /id="copyAnswerButton"/);
    assert.match(body, /id="downloadSessionButton"/);
    assert.match(body, /id="undoLastButton"/);
    assert.match(body, /data-quick-marker="simplify\?"/);
    assert.match(body, /data-quick-marker="ex\?"/);
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
    assert.match(scriptBody, /renderAnswerText/);
    assert.match(scriptBody, /showFullAnswer/);
    assert.match(scriptBody, /Choose the kind of help/);
    assert.match(scriptBody, /checkCodexStatus/);
    assert.match(scriptBody, /copySessionNotes/);
    assert.match(scriptBody, /copyCurrentAnswer/);
    assert.match(scriptBody, /downloadSessionNotes/);
    assert.match(scriptBody, /undoLastTurn/);
    assert.match(scriptBody, /resetForm/);
    assert.match(scriptBody, /scrollToResults/);
    assert.match(scriptBody, /Clear this tutor session history/);
    assert.match(scriptBody, /prepareFollowUpCheck/);
    assert.match(scriptBody, /Enter the new boxed work to check/);
    assert.match(scriptBody, /draftingFollowUpCheck/);
    assert.match(styleBody, /\.app-shell/);
    assert.match(styleBody, /\.intent-options/);
    assert.match(styleBody, /\.history-actions/);
  });

  it("allows localhost mode without pairing", async () => {
    const response = await fetch(`${baseUrl}/pairing`);
    const body = await response.json();

    assert.deepEqual(body, { required: false });
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
          status: "available",
          description: "Opt-in local Codex CLI provider. No auth-file inspection or private config reads."
        }
      ]
    });
  });

  it("returns safe Codex status diagnostics when requested", async () => {
    const response = await fetch(`${baseUrl}/codex/status`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.available, true);
    assert.equal(body.loginStatus, "ok");
    assert.equal(body.commandPath, "/usr/local/bin/codex");
    assert.deepEqual(
      body.checks.map((check: { name: string }) => check.name),
      ["which codex", "codex login status"]
    );
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

  it("exports the in-memory session as markdown notes", async () => {
    await fetch(`${baseUrl}/simulate-detection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regionText: "FOLLOW(A) = {$}",
        marker: "check?",
        courseHint: "CS 132 parsing",
        nearbyContext: "S -> A B"
      })
    });

    const response = await fetch(`${baseUrl}/session.md`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
    assert.match(body, /# Goodnotes Companion Tutor Session/);
    assert.match(body, /FOLLOW\(A\) = \{\$\}/);
    assert.match(body, /First issue:/);
    assert.doesNotMatch(body, /data:image/);
  });
});

describe("pairing-protected server", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp(new MockTutorProvider(), undefined, {
      pairing: { required: true, token: "secret-token", generated: false }
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

  it("requires a pairing token for API routes when enabled", async () => {
    const rejected = await fetch(`${baseUrl}/health`);
    const accepted = await fetch(`${baseUrl}/health`, {
      headers: { "x-pairing-token": "secret-token" }
    });

    assert.equal(rejected.status, 401);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await fetch(`${baseUrl}/pairing`).then((response) => response.json()), {
      required: true
    });
  });
});
