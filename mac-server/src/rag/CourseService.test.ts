import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { LocalCourseService } from "./CourseService.js";

describe("LocalCourseService", () => {
  let rootDir: string;
  let service: LocalCourseService;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "study-tool-course-service-"));
    service = new LocalCourseService({ rootDir });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("creates a course and indexes uploaded txt material into retrievable chunks", async () => {
    const course = await service.createCourse({
      name: "CS 132",
      description: "Parsing notes"
    });

    const file = await service.addTextFile(course.id, {
      originalName: "lecture-follow.txt",
      mimeType: "text/plain",
      text:
        "In this course, FOLLOW(A) receives FIRST(beta) when A is followed by beta in a production. " +
        "Add all terminals in FIRST(beta) except epsilon. If beta is nullable, FOLLOW of the left-hand side may also be added."
    });

    assert.equal(file.courseId, course.id);
    assert.equal(file.status, "indexed");
    assert.equal(file.originalName, "lecture-follow.txt");
    assert.equal(file.sizeBytes > 0, true);

    const status = await service.indexStatus(course.id);
    assert.equal(status.courseId, course.id);
    assert.equal(status.totalFiles, 1);
    assert.equal(status.indexedFiles, 1);
    assert.equal(status.chunkCount > 0, true);

    const results = await service.retrieve(course.id, {
      query: "FOLLOW(A) includes FIRST(B)",
      topK: 5
    });

    assert.equal(results.length > 0, true);
    assert.equal(results[0].fileId, file.id);
    assert.equal(results[0].courseId, course.id);
    assert.match(results[0].text, /except epsilon/);
    assert.match(results[0].sourceLabel, /lecture-follow\.txt/);
    assert.equal(typeof results[0].score, "number");
  });

  it("keeps retrieval scoped to the requested course", async () => {
    const parsing = await service.createCourse({ name: "Parsing" });
    const calculus = await service.createCourse({ name: "Calculus" });

    await service.addTextFile(parsing.id, {
      originalName: "follow.txt",
      mimeType: "text/plain",
      text: "FOLLOW(A) receives FIRST(beta) except epsilon."
    });
    await service.addTextFile(calculus.id, {
      originalName: "derivatives.txt",
      mimeType: "text/plain",
      text: "The derivative of x squared is two x."
    });

    const parsingResults = await service.retrieve(parsing.id, {
      query: "FOLLOW FIRST epsilon",
      topK: 5
    });
    const calculusResults = await service.retrieve(calculus.id, {
      query: "FOLLOW FIRST epsilon",
      topK: 5
    });

    assert.equal(parsingResults.length, 1);
    assert.match(parsingResults[0].sourceLabel, /follow\.txt/);
    assert.equal(calculusResults.length, 0);
  });

  it("marks pdf files as needs_ocr until local pdf text extraction is available", async () => {
    const course = await service.createCourse({ name: "Scanned textbook" });

    const file = await service.addTextFile(course.id, {
      originalName: "textbook.pdf",
      mimeType: "application/pdf",
      text: ""
    });

    assert.equal(file.status, "needs_ocr");
    assert.match(file.error ?? "", /PDF text extraction is not available/);
  });
});
