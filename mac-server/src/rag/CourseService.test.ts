import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
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

  it("streams an uploaded text file to local storage before indexing", async () => {
    const course = await service.createCourse({ name: "Streaming" });
    const file = await service.addFileStream(course.id, {
      originalName: "streamed-notes.txt",
      mimeType: "text/plain",
      stream: Readable.from([
        "FOLLOW(A) receives FIRST(beta) when beta follows A. ",
        "Add terminals except epsilon."
      ])
    });

    const results = await service.retrieve(course.id, {
      query: "FOLLOW FIRST except epsilon",
      topK: 5
    });

    assert.equal(file.status, "indexed");
    assert.equal(file.sizeBytes > 0, true);
    assert.equal(results.length, 1);
    assert.match(results[0].sourceLabel, /streamed-notes\.txt/);
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

  it("deletes an uploaded course file and removes its indexed chunks", async () => {
    const course = await service.createCourse({ name: "Parsing" });
    const file = await service.addTextFile(course.id, {
      originalName: "follow.txt",
      mimeType: "text/plain",
      text: "FOLLOW(A) receives FIRST(beta) except epsilon."
    });

    const beforeDelete = await service.retrieve(course.id, {
      query: "FOLLOW FIRST epsilon",
      topK: 5
    });
    assert.equal(beforeDelete.length, 1);

    const deleted = await service.deleteFile(course.id, file.id);
    assert.equal(deleted, true);

    const files = await service.listFiles(course.id);
    const afterDelete = await service.retrieve(course.id, {
      query: "FOLLOW FIRST epsilon",
      topK: 5
    });
    const status = await service.indexStatus(course.id);

    assert.equal(files.length, 0);
    assert.equal(afterDelete.length, 0);
    assert.equal(status.chunkCount, 0);
  });

  it("reindexes existing stored files after their local text changes", async () => {
    const course = await service.createCourse({ name: "Parsing" });
    const file = await service.addTextFile(course.id, {
      originalName: "follow.txt",
      mimeType: "text/plain",
      text: "FOLLOW(A) receives FIRST(beta) except epsilon."
    });

    await writeFile(
      file.storedPath,
      "A nullable suffix lets FOLLOW of the production left-hand side flow into FOLLOW(A)."
    );

    const status = await service.reindexCourse(course.id);
    const oldResults = await service.retrieve(course.id, {
      query: "FIRST beta epsilon",
      topK: 5
    });
    const newResults = await service.retrieve(course.id, {
      query: "nullable suffix left-hand side",
      topK: 5
    });

    assert.equal(status.indexedFiles, 1);
    assert.equal(status.chunkCount, 1);
    assert.equal(oldResults.length, 0);
    assert.equal(newResults.length, 1);
    assert.match(newResults[0].text, /nullable suffix/);
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
