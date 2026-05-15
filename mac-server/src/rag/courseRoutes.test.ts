import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { MockTutorProvider } from "../providers/MockTutorProvider.js";
import { createApp } from "../server.js";
import { InMemoryTutorStateStore } from "../session/TutorStateStore.js";
import { LocalCourseService } from "./CourseService.js";

describe("course RAG routes", () => {
  let rootDir: string;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "study-tool-course-routes-"));
    const courseService = new LocalCourseService({ rootDir });
    const app = createApp(new MockTutorProvider(), new InMemoryTutorStateStore("course-route-session"), {
      courseService
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
    await rm(rootDir, { recursive: true, force: true });
  });

  it("creates a course, indexes a fixture text file, retrieves it, and grounds tutor answers", async () => {
    const created = await jsonRequest("POST", "/courses", {
      name: "CS 132",
      description: "Parsing"
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.course.name, "CS 132");

    const courseId = created.body.course.id;
    const uploaded = await jsonRequest("POST", `/courses/${courseId}/files`, {
      originalName: "lecture-follow.txt",
      mimeType: "text/plain",
      text:
        "In this course, FOLLOW(A) receives FIRST(beta) when A is followed by beta in a production. " +
        "Add all terminals in FIRST(beta) except epsilon. If beta is nullable, FOLLOW of the left-hand side may also be added."
    });

    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.file.status, "indexed");

    const streamed = await fetch(`${baseUrl}/courses/${courseId}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-file-name": "streamed-follow.txt"
      },
      body: "A streamed upload can say FOLLOW(A) receives FIRST(beta) except epsilon."
    });
    const streamedBody = await streamed.json();

    assert.equal(streamed.status, 201);
    assert.equal(streamedBody.file.status, "indexed");
    assert.equal(streamedBody.file.originalName, "streamed-follow.txt");

    const listed = await jsonRequest("GET", "/courses");
    assert.equal(listed.body.courses.length, 1);

    const status = await jsonRequest("GET", `/courses/${courseId}/index-status`);
    assert.equal(status.body.indexedFiles, 2);
    assert.equal(status.body.chunkCount > 0, true);

    const reindexed = await jsonRequest("POST", `/courses/${courseId}/reindex`);
    assert.equal(reindexed.status, 200);
    assert.equal(reindexed.body.indexedFiles, 2);
    assert.equal(reindexed.body.chunkCount > 0, true);

    const retrieved = await jsonRequest("POST", `/courses/${courseId}/retrieve`, {
      query: "FOLLOW(A) includes FIRST(B)",
      topK: 5
    });

    assert.equal(retrieved.status, 200);
    assert.match(retrieved.body.chunks[0].text, /except epsilon/);
    assert.match(retrieved.body.chunks[0].sourceLabel, /lecture-follow\.txt/);

    const bareQuestion = await jsonRequest("POST", "/ask", {
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing",
      nearbyContext: "FIRST and FOLLOW sets",
      courseId,
      useCourseGrounding: true
    });

    assert.equal(bareQuestion.body.type, "intent_options");
    assert.equal("answer" in bareQuestion.body, false);

    const groundedAnswer = await jsonRequest("POST", "/ask", {
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      selectedIntent: "Explain when FOLLOW includes FIRST",
      courseHint: "CS 132 parsing",
      nearbyContext: "FIRST and FOLLOW sets",
      courseId,
      useCourseGrounding: true
    });

    assert.equal(groundedAnswer.body.type, "tutor_answer");
    assert.equal(groundedAnswer.body.grounded, true);
    assert.equal(groundedAnswer.body.groundingStatus, "used_course_context");
    assert.equal(groundedAnswer.body.sources.length >= 1, true);
    assert.equal(
      groundedAnswer.body.sources.some((source: { fileId: string }) => source.fileId === uploaded.body.file.id),
      true
    );
    assert.match(groundedAnswer.body.answer, /uploaded course material/i);

    const deleted = await jsonRequest("DELETE", `/courses/${courseId}/files/${uploaded.body.file.id}`);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);

    const afterDelete = await jsonRequest("POST", `/courses/${courseId}/retrieve`, {
      query: "nullable left-hand side",
      topK: 5
    });
    assert.equal(afterDelete.body.chunks.length, 0);
  });

  async function jsonRequest(method: string, route: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    return {
      status: response.status,
      body: await response.json()
    };
  }
});
