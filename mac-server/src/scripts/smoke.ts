import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";
import { MockTutorProvider } from "../providers/MockTutorProvider.js";
import { InMemoryTutorStateStore } from "../session/TutorStateStore.js";
import { LocalCourseService } from "../rag/CourseService.js";

type LogFn = (line: string) => void;

export async function runSmoke(log: LogFn = console.log): Promise<void> {
  const courseRoot = await mkdtemp(path.join(os.tmpdir(), "study-tool-smoke-rag-"));
  const app = createApp(new MockTutorProvider(), new InMemoryTutorStateStore("smoke-session"), {
    courseService: new LocalCourseService({ rootDir: courseRoot })
  });
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

    const course = await jsonRequest(baseUrl, "POST /courses", "/courses", {
      method: "POST",
      body: {
        name: "Smoke CS 132",
        description: "Local RAG smoke fixture"
      },
      expectedStatus: 201
    });
    const courseId = course.course.id;
    log("POST /courses -> course created");

    const uploaded = await jsonRequest(baseUrl, "POST /courses/:id/files", `/courses/${courseId}/files`, {
      method: "POST",
      body: {
        originalName: "follow-smoke.txt",
        mimeType: "text/plain",
        text:
          "In this course, FOLLOW(A) receives FIRST(beta) when A is followed by beta in a production. " +
          "Add all terminals in FIRST(beta) except epsilon. If beta is nullable, FOLLOW of the left-hand side may also be added."
      },
      expectedStatus: 201
    });
    assert.equal(uploaded.file.status, "indexed");
    log("POST /courses/:id/files -> indexed text fixture");

    const streamed = await jsonRequest(baseUrl, "POST /courses/:id/files stream", `/courses/${courseId}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-file-name": "follow-stream.txt"
      },
      rawBody: "A streamed local upload says FOLLOW(A) receives FIRST(beta) except epsilon.",
      expectedStatus: 201
    });
    assert.equal(streamed.file.status, "indexed");
    log("POST /courses/:id/files text/plain -> streamed fixture");

    const courses = await jsonRequest(baseUrl, "GET /courses", "/courses");
    assert.ok(courses.courses.some((candidate: { id: string }) => candidate.id === courseId));
    log("GET /courses -> includes course");

    const settings = await jsonRequest(baseUrl, "POST /session/settings", "/session/settings", {
      method: "POST",
      body: {
        activeCourseId: courseId,
        useCourseGrounding: true
      }
    });
    assert.equal(settings.session.activeCourseId, courseId);
    assert.equal(settings.session.useCourseGrounding, true);
    log("POST /session/settings -> course settings saved");

    const indexStatus = await jsonRequest(
      baseUrl,
      "GET /courses/:id/index-status",
      `/courses/${courseId}/index-status`
    );
    assert.equal(indexStatus.indexedFiles, 2);
    assert.equal(indexStatus.chunkCount > 0, true);
    log("GET /courses/:id/index-status -> indexed");

    const retrieval = await jsonRequest(baseUrl, "POST /courses/:id/retrieve", `/courses/${courseId}/retrieve`, {
      method: "POST",
      body: {
        query: "FOLLOW(A) includes FIRST(B)",
        topK: 5
      }
    });
    assert.match(retrieval.chunks[0].text, /except epsilon/);
    log("POST /courses/:id/retrieve -> relevant chunk");

    const intentOptions = await jsonRequest(baseUrl, "POST /ask ?", "/ask", {
      method: "POST",
      body: {
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        courseHint: "CS 132 parsing",
        nearbyContext: "FIRST and FOLLOW sets",
        courseId,
        useCourseGrounding: true
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
        nearbyContext: "FIRST and FOLLOW sets",
        courseId,
        useCourseGrounding: true
      }
    });
    assert.equal(selectedIntent.type, "tutor_answer");
    assert.equal(selectedIntent.groundingStatus, "used_course_context");
    assert.equal(selectedIntent.sources[0].fileId, uploaded.file.id);
    log("POST /ask selected intent -> grounded tutor_answer");

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

    const emptyFrame = await jsonRequest(baseUrl, "POST /frame empty", "/frame", {
      method: "POST",
      body: {},
      expectedStatus: 400
    });
    assert.equal(emptyFrame.type, "error");
    assert.match(emptyFrame.answer, /frame data is required/);
    log("POST /frame empty -> validation error");

    const manualFrame = await jsonRequest(baseUrl, "POST /frame manual", "/frame", {
      method: "POST",
      body: {
        dataUrl: "data:text/plain;base64,aGVsbG8=",
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker: "?",
        courseHint: "CS 132 parsing"
      }
    });
    assert.equal(manualFrame.tutorResponse.type, "intent_options");
    assert.equal(manualFrame.frame.saved, false);
    log("POST /frame manual -> intent_options");

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
    await rm(courseRoot, { recursive: true, force: true });
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
  options: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
    expectedStatus?: number;
  } = {}
): Promise<Record<string, any>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.headers ?? (options.body ? { "Content-Type": "application/json" } : undefined),
    body: options.rawBody ?? (options.body ? JSON.stringify(options.body) : undefined)
  });
  const body = await response.json();
  assert.equal(
    response.status,
    options.expectedStatus ?? 200,
    `${label} returned ${response.status}: ${JSON.stringify(body)}`
  );
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
