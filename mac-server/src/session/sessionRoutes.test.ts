import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server.js";
import type { TutorProvider, TutorRequest, TutorResponse } from "../providers/TutorProvider.js";
import { InMemoryTutorStateStore } from "./TutorStateStore.js";

describe("session routes", () => {
  let server: Server;
  let baseUrl: string;
  let provider: RecordingProvider;

  before(async () => {
    provider = new RecordingProvider();
    const app = createApp(provider, new InMemoryTutorStateStore("route-test-session"));
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

  it("creates intent options for a simulated detection with marker ?", async () => {
    const response = await post("/simulate-detection", {
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.sessionId, "route-test-session");
    assert.equal(response.body.detectedQuestion.marker, "?");
    assert.equal(response.body.tutorResponse.type, "intent_options");
  });

  it("selects an intent and records a tutor answer", async () => {
    const response = await post("/select-intent", {
      selectedIntent: "Explain when FOLLOW includes FIRST"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tutorResponse.type, "tutor_answer");
    assert.equal(response.body.tutorResponse.answer, "answer 2");

    const session = await get("/session");
    assert.equal(session.body.turns.length, 1);
    assert.equal(session.body.turns[0].selectedIntent, "Explain when FOLLOW includes FIRST");
  });

  it("passes previous tutor context into check? follow-up work", async () => {
    const response = await post("/simulate-detection", {
      regionText: "FOLLOW(A) = {$}",
      marker: "check?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tutorResponse.type, "tutor_answer");
    const lastProviderRequest = provider.requests.at(-1);
    assert.equal(lastProviderRequest?.marker, "check?");
    assert.equal(lastProviderRequest?.previousTutorState?.length, 1);
  });

  it("returns latest response and clears session state", async () => {
    const latest = await get("/latest");

    assert.equal(latest.status, 200);
    assert.equal(latest.body.latest.detectedQuestion.marker, "check?");
    assert.equal(latest.body.latest.tutorResponse.type, "tutor_answer");

    const cleared = await post("/clear-session", {});
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.session.turns.length, 0);

    const latestAfterClear = await get("/latest");
    assert.equal(latestAfterClear.body.latest, null);
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

  async function get(path: string) {
    const response = await fetch(`${baseUrl}${path}`);

    return {
      status: response.status,
      body: await response.json()
    };
  }
});

class RecordingProvider implements TutorProvider {
  readonly name = "mock" as const;
  readonly requests: TutorRequest[] = [];

  async ask(request: TutorRequest): Promise<TutorResponse> {
    this.requests.push(request);

    if (request.marker === "?" && !request.selectedIntent) {
      return {
        type: "intent_options",
        options: ["Explain", "Check", "Example"],
        provider: this.name
      };
    }

    return {
      type: "tutor_answer",
      answer: `answer ${this.requests.length}`,
      confidence: 0.8,
      provider: this.name
    };
  }
}
