import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server.js";
import { MockTutorProvider } from "../providers/MockTutorProvider.js";
import { InMemoryTutorStateStore } from "../session/TutorStateStore.js";

type LogFn = (line: string) => void;

export async function runSmoke(log: LogFn = console.log): Promise<void> {
  const app = createApp(new MockTutorProvider(), new InMemoryTutorStateStore("smoke-session"));
  const server = await listen(app);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const home = await textRequest(baseUrl, "GET /", "/");
    assert.match(home, /Goodnotes Companion Tutor/);
    log("GET / -> html");

    const health = await jsonRequest(baseUrl, "GET /health", "/health");
    assert.equal(health.ok, true);
    assert.equal(health.provider, "mock");
    log("GET /health -> mock");

    const providers = await jsonRequest(baseUrl, "GET /providers", "/providers");
    assert.equal(providers.activeProvider, "mock");
    assert.ok(Array.isArray(providers.providers));
    log("GET /providers -> provider list");

    const intentOptions = await jsonRequest(baseUrl, "POST /ask ?", "/ask", {
      method: "POST",
      body: {
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        courseHint: "CS 132 parsing",
        nearbyContext: "FIRST and FOLLOW sets"
      }
    });
    assert.equal(intentOptions.type, "intent_options");
    assert.equal("answer" in intentOptions, false);
    log("POST /ask ? -> intent_options");

    const selectedIntent = await jsonRequest(baseUrl, "POST /ask selected intent", "/ask", {
      method: "POST",
      body: {
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        selectedIntent: "Explain when FOLLOW includes FIRST",
        courseHint: "CS 132 parsing",
        nearbyContext: "FIRST and FOLLOW sets"
      }
    });
    assert.equal(selectedIntent.type, "tutor_answer");
    log("POST /ask selected intent -> tutor_answer");

    const followCheck = await jsonRequest(baseUrl, "POST /ask check?", "/ask", {
      method: "POST",
      body: {
        regionText: "FOLLOW(A) = { FIRST(B), ε, $ }",
        marker: "check?",
        courseHint: "CS 132 parsing",
        nearbyContext: "Checking whether my FOLLOW set is correct"
      }
    });
    assert.equal(followCheck.type, "tutor_answer");
    assert.match(followCheck.answer, /FOLLOW sets should not contain ε/);
    log("POST /ask check? -> concrete issue");

    const tickCheck = await jsonRequest(baseUrl, "POST /ask tick", "/ask", {
      method: "POST",
      body: {
        regionText: "x = 5",
        marker: "✓?",
        courseHint: "Algebra",
        nearbyContext: "Solve 2x + 3 = 13"
      }
    });
    assert.equal(tickCheck.type, "tutor_answer");
    assert.match(tickCheck.answer, /correct so far/);
    log("POST /ask ✓? -> check path");

    const detection = await jsonRequest(baseUrl, "POST /simulate-detection", "/simulate-detection", {
      method: "POST",
      body: {
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        courseHint: "CS 132 parsing",
        nearbyContext: "FIRST and FOLLOW sets"
      }
    });
    assert.equal(detection.tutorResponse.type, "intent_options");
    log("POST /simulate-detection -> latest detection");

    const answer = await jsonRequest(baseUrl, "POST /select-intent", "/select-intent", {
      method: "POST",
      body: {
        selectedIntent: "Explain when FOLLOW includes FIRST"
      }
    });
    assert.equal(answer.tutorResponse.type, "tutor_answer");
    log("POST /select-intent -> tutor_answer");

    const latest = await jsonRequest(baseUrl, "GET /latest", "/latest");
    assert.equal(latest.latest.tutorResponse.type, "tutor_answer");
    log("GET /latest -> current item");

    const session = await jsonRequest(baseUrl, "GET /session", "/session");
    assert.ok(session.turns.length >= 1);
    log("GET /session -> history");

    const cleared = await jsonRequest(baseUrl, "POST /clear-session", "/clear-session", {
      method: "POST"
    });
    assert.equal(cleared.session.latest, null);
    assert.equal(cleared.session.turns.length, 0);
    log("POST /clear-session -> reset");

    log("Smoke test passed");
  } finally {
    await close(server);
  }
}

async function listen(app: ReturnType<typeof createApp>): Promise<Server> {
  return new Promise<Server>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function textRequest(baseUrl: string, label: string, path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();
  assert.equal(response.status, 200, `${label} returned ${response.status}: ${body}`);
  return body;
}

async function jsonRequest(
  baseUrl: string,
  label: string,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Record<string, any>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  assert.equal(response.status, 200, `${label} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
